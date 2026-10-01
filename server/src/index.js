import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import P from "pino";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionsDir = path.resolve(process.env.SESSIONS_DIR || "./sessions");
const logger = P({ level: process.env.LOG_LEVEL || "info" });
const sessions = new Map();

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

await fs.mkdir(sessionsDir, { recursive: true });

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
    qr: session.qr ? true : false,
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
  } catch {
    version = undefined;
  }

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
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      session.qr = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
      session.status = "qr";
    }

    if (connection === "open") {
      session.status = "connected";
      session.qr = null;
      session.pairingCode = null;
      session.error = null;
    }

    if (connection === "close") {
      session.sock = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      session.qr = null;
      session.pairingCode = null;

      if (loggedOut) {
        session.status = "logged_out";
        return;
      }

      session.status = "reconnecting";
      setTimeout(() => {
        createSocket(session).catch((error) => {
          session.status = "error";
          session.error = error.message;
        });
      }, 1500);
    }
  });

  return sock;
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "zyvox-session",
    message: "Zyvox Baileys API is running"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "zyvox-session" });
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

  try {
    await createSocket(session);
    res.status(201).json(publicSession(session));
  } catch (error) {
    session.status = "error";
    session.error = error.message;
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
  res.json({ sessionId: session.id, qr: session.qr });
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
    res.json({ sessionId: session.id, phone, pairingCode: code, status: session.status });
  } catch (error) {
    session.status = "error";
    session.error = error.message;
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/sessions/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  try {
    session.sock?.end(undefined);
  } catch {}

  sessions.delete(session.id);
  await fs.rm(path.join(sessionsDir, session.id), { recursive: true, force: true });
  res.json({ ok: true });
});

app.listen(port, () => logger.info({ port }, "Zyvox server started"));
