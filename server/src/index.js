import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import P from "pino";
import pg from "pg";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const sessionsDir = path.resolve(process.env.SESSIONS_DIR || "./sessions");
const logger = P({ level: process.env.LOG_LEVEL || "info" });
const sessions = new Map();
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

await fs.mkdir(sessionsDir, { recursive: true });

async function initDb() {
  if (!pool) {
    logger.warn("DATABASE_URL is not configured; sessions will only live in memory.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(64) PRIMARY KEY,
      phone VARCHAR(20),
      status VARCHAR(32) NOT NULL DEFAULT 'starting',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function saveSession(session) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO sessions (session_id, phone, status, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (session_id)
     DO UPDATE SET phone = EXCLUDED.phone, status = EXCLUDED.status, updated_at = NOW()`,
    [session.id, session.phone || null, session.status]
  );
}

async function deleteSessionRecord(id) {
  if (pool) await pool.query("DELETE FROM sessions WHERE session_id = $1", [id]);
}

function newSessionId() {
  return crypto.randomBytes(12).toString("hex");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function publicSession(session) {
  return {
    sessionId: session.id,
    status: session.status,
    qr: Boolean(session.qr),
    pairingCode: session.pairingCode || null,
    phone: session.phone || null,
    error: session.error || null
  };
}

async function createSocket(session) {
  const authPath = path.join(sessionsDir, session.id);
  await fs.mkdir(authPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {}

  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu("Chrome"),
    logger: P({ level: process.env.BAILEYS_LOG_LEVEL || "silent" }),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false
  });

  session.sock = sock;
  session.status = "connecting";
  await saveSession(session);
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      session.qr = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
      session.status = "qr";
      await saveSession(session);
    }

    if (connection === "open") {
      session.status = "connected";
      session.qr = null;
      session.pairingCode = null;
      session.error = null;
      await saveSession(session);
    }

    if (connection === "close") {
      session.sock = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      session.qr = null;
      session.pairingCode = null;

      if (loggedOut) {
        session.status = "logged_out";
        await saveSession(session);
        return;
      }

      session.status = "reconnecting";
      await saveSession(session);
      setTimeout(() => {
        createSocket(session).catch(async (error) => {
          session.status = "error";
          session.error = error.message;
          await saveSession(session);
        });
      }, 1500);
    }
  });

  return sock;
}

async function restoreSessions() {
  if (!pool) return;
  const { rows } = await pool.query("SELECT session_id, phone, status FROM sessions ORDER BY created_at ASC");
  for (const row of rows) {
    const session = {
      id: row.session_id,
      status: row.status,
      qr: null,
      pairingCode: null,
      phone: row.phone,
      error: null,
      sock: null
    };
    sessions.set(session.id, session);
    createSocket(session).catch(async (error) => {
      session.status = "error";
      session.error = error.message;
      await saveSession(session);
    });
  }
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "zyvox-session",
    message: "Zyvox Baileys API is running"
  });
});

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "zyvox-session",
    database: Boolean(pool),
    sessions: sessions.size
  });
});

app.post("/api/sessions", async (_req, res) => {
  const id = newSessionId();
  const session = {
    id,
    status: "starting",
    qr: null,
    pairingCode: null,
    phone: null,
    error: null,
    sock: null
  };
  sessions.set(id, session);
  await saveSession(session);

  try {
    await createSocket(session);
    res.status(201).json(publicSession(session));
  } catch (error) {
    session.status = "error";
    session.error = error.message;
    await saveSession(session);
    res.status(500).json(publicSession(session));
  }
});

app.get("/api/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(publicSession(session));
});

app.get("/api/sessions/:id/qr", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.qr) return res.status(404).json({ error: "QR not available", status: session.status });

  const prefix = "data:image/png;base64,";
  if (!session.qr.startsWith(prefix)) {
    return res.status(500).json({ error: "Invalid QR data" });
  }

  res.type("png").send(Buffer.from(session.qr.slice(prefix.length), "base64"));
});

app.post("/api/sessions/:id/pair", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const phone = normalizePhone(req.body?.phone);
  if (!/^\d{8,15}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number with country code, digits only." });
  }

  try {
    if (!session.sock) await createSocket(session);
    if (session.sock.authState?.creds?.registered) {
      return res.status(409).json({ error: "This session is already registered.", status: session.status });
    }

    const code = await session.sock.requestPairingCode(phone);
    session.phone = phone;
    session.pairingCode = code;
    session.status = "pairing";
    await saveSession(session);
    res.json({ sessionId: session.id, phone, pairingCode: code, status: session.status });
  } catch (error) {
    session.status = "error";
    session.error = error.message;
    await saveSession(session);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/sessions/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  try { session.sock?.end(undefined); } catch {}
  sessions.delete(session.id);
  await deleteSessionRecord(session.id);
  await fs.rm(path.join(sessionsDir, session.id), { recursive: true, force: true });
  res.json({ ok: true });
});

await initDb();
await restoreSessions();

app.listen(port, () => logger.info({ port }, "Zyvox server started"));
