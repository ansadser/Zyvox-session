import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

function App() {
  const [session, setSession] = useState(null);
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState("qr");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const createSession = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(API + "/api/sessions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create session");
      setSession(data);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.sessionId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(API + "/api/sessions/" + session.sessionId);
        if (res.ok) setSession(await res.json());
      } catch {}
    }, 1500);
    return () => clearInterval(timer);
  }, [session?.sessionId]);

  const pair = async () => {
    if (!phone.trim() || !session) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(API + "/api/sessions/" + session.sessionId + "/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pairing failed");
      setSession((s) => ({ ...s, ...data }));
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied to clipboard.");
      setTimeout(() => setMessage(""), 1200);
    } catch {
      setMessage("Copy failed. Please copy it manually.");
    }
  };

  const deleteSession = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await fetch(API + "/api/sessions/" + session.sessionId, { method: "DELETE" });
      setSession(null);
      setPhone("");
      setMode("qr");
      setMessage("Session closed.");
    } catch (e) {
      setMessage("Could not close session.");
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = session?.status?.replace("_", " ") || "";

  return (
    <main className="page">
      <div className="glow glow-one" />
      <div className="glow glow-two" />

      <section className="card">
        <header className="header">
          <div className="brand-mark">Z</div>
          <div>
            <div className="brand">ZYVOX</div>
            <div className="eyebrow">SESSION CENTER</div>
          </div>
          <div className="secure-pill"><span /> Secure</div>
        </header>

        <div className="hero">
          <div className="badge">WHATSAPP CONNECT</div>
          <h1>Connect your<br /><span>WhatsApp session.</span></h1>
          <p>Link an authorized account with a secure QR scan or pairing code.</p>
        </div>

        {!session ? (
          <button className="primary full" onClick={createSession} disabled={loading}>
            <span>{loading ? "Starting session…" : "Start New Session"}</span>
            {!loading && <b>→</b>}
          </button>
        ) : (
          <>
            <div className="session-top">
              <div>
                <div className="section-label">ACTIVE SESSION</div>
                <div className="mini-id">{session.sessionId.slice(0, 12)}…</div>
              </div>
              <div className={"status-pill " + session.status}>
                <span /> {statusLabel}
              </div>
            </div>

            <div className="tabs">
              <button className={mode === "qr" ? "tab active" : "tab"} onClick={() => setMode("qr")}>
                <span>⌁</span> QR Code
              </button>
              <button className={mode === "pair" ? "tab active" : "tab"} onClick={() => setMode("pair")}>
                <span>⌘</span> Pairing Code
              </button>
            </div>

            {mode === "qr" && (
              <div className="qr-panel">
                {session.status === "connected" ? (
                  <div className="connected-state">
                    <div className="success-icon">✓</div>
                    <strong>WhatsApp Connected</strong>
                    <span>Your session is active and ready.</span>
                  </div>
                ) : session.qr ? (
                  <>
                    <div className="qr-frame">
                      <img src={API + "/api/sessions/" + session.sessionId + "/qr"} alt="WhatsApp QR code" />
                    </div>
                    <div className="scan-help"><span /> Open WhatsApp → Linked devices → Link a device</div>
                  </>
                ) : (
                  <div className="waiting-state">
                    <div className="spinner" />
                    <strong>Preparing your QR code…</strong>
                    <span>Keep this page open.</span>
                  </div>
                )}
              </div>
            )}

            {mode === "pair" && (
              <div className="pair-panel">
                <label>PHONE NUMBER</label>
                <div className="input-wrap">
                  <span>+</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="919876543210"
                    inputMode="numeric"
                    maxLength={15}
                  />
                </div>
                <small>Include your country code, without spaces or symbols.</small>
                <button className="primary full" onClick={pair} disabled={loading || !phone.trim()}>
                  {loading ? "Generating…" : "Get Pairing Code"} <b>→</b>
                </button>
                {session.pairingCode && (
                  <button className="code" onClick={() => copy(session.pairingCode)} title="Copy pairing code">
                    {session.pairingCode}
                  </button>
                )}
              </div>
            )}

            <div className="session-id">
              <div>
                <span>SESSION ID</span>
                <strong>{session.sessionId}</strong>
              </div>
              <button onClick={() => copy(session.sessionId)}>Copy</button>
            </div>

            <button className="close-session" onClick={deleteSession} disabled={loading}>
              Close session
            </button>
          </>
        )}

        {message && <div className="message">{message}</div>}
        <footer>Use only with WhatsApp accounts you own or are authorized to connect.</footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
