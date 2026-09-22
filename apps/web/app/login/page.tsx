"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setToken } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (localStorage.getItem("ai_support_token")) router.replace("/");
  }, [router]);

  async function login() {
    if (!email || !password) { setError("Email and password required"); return; }
    setError(""); setLoading(true);
    const res = await fetch("http://localhost:3000/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());
    setLoading(false);
    if (res.success) { setToken(res.data.token, res.data.company.name); router.push("/"); }
    else setError(res.error ?? "Login failed");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Sedef iridescent background layers */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: [
          "radial-gradient(ellipse 70% 50% at 20% 10%, rgba(210,205,255,0.10) 0%, transparent 60%)",
          "radial-gradient(ellipse 60% 40% at 80% 80%, rgba(200,230,255,0.08) 0%, transparent 55%)",
          "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,252,245,0.5) 0%, transparent 70%)",
        ].join(", "),
      }} />

      <div className="fade-up" style={{ width: 380, position: "relative", zIndex: 1 }}>

        {/* Wordmark */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 22 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "var(--r-md)",
              background: "var(--primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "#fff", fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}>A</div>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>
              AI Support
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(1.6rem, 3vw, 2rem)",
            fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1,
            color: "var(--text)", marginBottom: 10,
          }}>Welcome back</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 500 }}>
              Sign up free
            </Link>
          </p>
        </div>

        {/* Pearl frosted card */}
        <div style={{
          background: "rgba(255, 255, 255, 0.84)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "1px solid rgba(255, 255, 255, 0.96)",
          borderRadius: "var(--r-xl)",
          padding: "32px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.10em",
                textTransform: "uppercase", color: "var(--text-muted)",
                display: "block", marginBottom: 7,
              }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" autoFocus
                onKeyDown={(e) => e.key === "Enter" && login()}
                style={{ width: "100%", padding: "11px 14px" }} />
            </div>
            <div>
              <label style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.10em",
                textTransform: "uppercase", color: "var(--text-muted)",
                display: "block", marginBottom: 7,
              }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && login()}
                style={{ width: "100%", padding: "11px 14px" }} />
            </div>
          </div>

          {error && (
            <div className="fade-in" style={{
              fontSize: 12, color: "var(--error)", marginTop: 14,
              padding: "9px 13px", background: "var(--error-dim)", borderRadius: 8,
              border: "1px solid rgba(185,28,28,0.15)",
            }}>{error}</div>
          )}

          <button onClick={login} disabled={loading} style={{
            marginTop: 20, width: "100%",
            background: loading ? "var(--bg-active)" : "var(--primary)",
            color: loading ? "var(--text-muted)" : "#fff",
            border: "none", borderRadius: "var(--r-md)", padding: "13px",
            fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
            boxShadow: !loading ? "0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.12)" : "none",
            transition: "all 0.15s var(--ease)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
          onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--primary-mid)"; }}
          onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--primary)"; }}>
            {loading && <span className="spinner" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
