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
      const res = await fetch(API + "/api/sessions/" + session.sessionId);
      if (res.ok) setSession(await res.json());
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
    await navigator.clipboard.writeText(value);
    setMessage("Copied.");
    setTimeout(() => setMessage(""), 1200);
  };

  return (
    <main className="page">
      <section className="card">
        <div className="brand">ZYVOX</div>
        <h1>WhatsApp Session</h1>
        <p>Connect an authorized WhatsApp account using QR or a pairing code.</p>

        {!session ? (
          <button className="primary full" onClick={createSession} disabled={loading}>
            {loading ? "Starting…" : "Start Session"}
          </button>
        ) : (
          <>
            <div className="tabs">
              <button className={mode === "qr" ? "tab active" : "tab"} onClick={() => setMode("qr")}>QR Code</button>
              <button className={mode === "pair" ? "tab active" : "tab"} onClick={() => setMode("pair")}>Pairing Code</button>
            </div>

            {mode === "qr" && (
              <div className="qrbox">
                {session.status === "connected" ? (
                  <div className="connected">✓ WhatsApp Connected</div>
                ) : session.qr ? (
                  <img src={API + "/api/sessions/" + session.sessionId + "/qr"} alt="WhatsApp QR" />
                ) : (
                  <div className="loader">Waiting for QR…</div>
                )}
              </div>
            )}

            {mode === "pair" && (
              <div className="pairbox">
                <label>Phone number with country code</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="919876543210" inputMode="numeric" />
                <button className="primary full" onClick={pair} disabled={loading}>Get Pairing Code</button>
                {session.pairingCode && (
                  <div className="code" onClick={() => copy(session.pairingCode)}>{session.pairingCode}</div>
                )}
              </div>
            )}

            <div className={"status " + session.status}>
              <span>●</span> {session.status.replace("_", " ")}
            </div>
            <div className="session">
              <span>Session ID</span>
              <button onClick={() => copy(session.sessionId)}>{session.sessionId} · Copy</button>
            </div>
          </>
        )}

        {message && <div className="message">{message}</div>}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
