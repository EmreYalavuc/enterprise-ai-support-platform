"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setToken } from "../lib/api";

const pearlCard = {
  background: "rgba(255, 255, 255, 0.84)",
  backdropFilter: "blur(24px) saturate(160%)",
  WebkitBackdropFilter: "blur(24px) saturate(160%)",
  border: "1px solid rgba(255, 255, 255, 0.96)",
  borderRadius: "var(--r-xl)",
  padding: "32px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)",
} as React.CSSProperties;

const pageWrapper = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--bg)", position: "relative", overflow: "hidden",
} as React.CSSProperties;

const irisBg = (
  <div style={{
    position: "absolute", inset: 0, pointerEvents: "none",
    background: [
      "radial-gradient(ellipse 70% 50% at 20% 10%, rgba(210,205,255,0.10) 0%, transparent 60%)",
      "radial-gradient(ellipse 60% 40% at 80% 80%, rgba(200,230,255,0.08) 0%, transparent 55%)",
    ].join(", "),
  }} />
);

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [apiKey,      setApiKey]      = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [copied,      setCopied]      = useState(false);

  async function register() {
    if (!companyName || !email || !password) { setError("All fields are required"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(""); setLoading(true);
    const res = await fetch("http://localhost:3000/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName, email, password }),
    }).then((r) => r.json());
    setLoading(false);
    if (res.success) { setApiKey(res.data.api_key); setToken(res.data.token, res.data.company.name); }
    else setError(res.error ?? "Registration failed");
  }

  function copyKey() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (apiKey) {
    return (
      <div style={pageWrapper}>
        {irisBg}
        <div className="fade-up" style={{ width: 480, position: "relative", zIndex: 1 }}>
          <div style={pearlCard}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", margin: "0 auto 16px",
                background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, color: "var(--success)",
              }}>✓</div>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 6, color: "var(--text)" }}>
                Account created!
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Save your API key — it will only be shown once.
              </p>
            </div>

            <div style={{
              background: "var(--bg-elevated)", border: "1px solid var(--border-mid)",
              borderRadius: 10, padding: "16px 18px", marginBottom: 20, position: "relative",
            }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                Your API Key
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--font-mono), monospace", color: "var(--text)", wordBreak: "break-all", lineHeight: 1.6 }}>
                {apiKey}
              </div>
              <button onClick={copyKey} style={{
                position: "absolute", top: 12, right: 12,
                background: copied ? "rgba(21,128,61,0.08)" : "var(--bg-card)",
                border: `1px solid ${copied ? "rgba(21,128,61,0.2)" : "var(--border-mid)"}`,
                borderRadius: 6, padding: "4px 10px", fontSize: 11,
                color: copied ? "var(--success)" : "var(--text-secondary)",
              }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>

            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
              Use this key to integrate the chatbot widget on your website or connect via WhatsApp.
            </p>

            <button onClick={() => router.push("/")} style={{
              width: "100%", background: "var(--primary)",
              color: "#fff", border: "none", borderRadius: "var(--r-md)", padding: "13px",
              fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.12)",
            }}>
              Go to Dashboard →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrapper}>
      {irisBg}
      <div className="fade-up" style={{ width: 400, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 22 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "var(--r-md)",
              background: "var(--primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "#fff", fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}>A</div>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>AI Support</span>
          </div>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2rem)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--text)", marginBottom: 10 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>

        <div style={pearlCard}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Company Name", value: companyName, set: setCompanyName, type: "text",     placeholder: "Acme Inc." },
              { label: "Email",        value: email,       set: setEmail,       type: "email",    placeholder: "you@company.com" },
              { label: "Password",     value: password,    set: setPassword,    type: "password", placeholder: "Min 8 characters" },
            ].map(({ label, value, set, type, placeholder }) => (
              <div key={label}>
                <label style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.10em",
                  textTransform: "uppercase", color: "var(--text-muted)",
                  display: "block", marginBottom: 7,
                }}>{label}</label>
                <input type={type} value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  onKeyDown={(e) => e.key === "Enter" && register()}
                  style={{ width: "100%", padding: "11px 14px" }} />
              </div>
            ))}
          </div>

          {error && (
            <div className="fade-in" style={{
              fontSize: 12, color: "var(--error)", marginTop: 14,
              padding: "9px 13px", background: "var(--error-dim)", borderRadius: 8,
              border: "1px solid rgba(185,28,28,0.15)",
            }}>{error}</div>
          )}

          <button onClick={register} disabled={loading} style={{
            marginTop: 20, width: "100%",
            background: loading ? "var(--bg-active)" : "var(--primary)",
            color: loading ? "var(--text-muted)" : "#fff",
            border: "none", borderRadius: "var(--r-md)", padding: "13px",
            fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
            boxShadow: !loading ? "0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.12)" : "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {loading && <span className="spinner" />}
            {loading ? "Creating account…" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
