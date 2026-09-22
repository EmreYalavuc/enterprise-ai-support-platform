"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

// ─── AI Ayarları ──────────────────────────────────────────────────────────────
const PROVIDERS = [
  { value: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-api03-...", models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"] },
  { value: "gemini", label: "Gemini (Google)", placeholder: "AIza...", models: ["gemini-3.6-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"] },
  { value: "mock", label: "Mock (Test — API key gerektirmez)", placeholder: "", models: [] },
];

const DB_TYPES = [
  { value: "postgresql", label: "PostgreSQL", placeholder: "postgresql://user:pass@host:5432/dbname" },
  { value: "mysql",      label: "MySQL",      placeholder: "mysql://user:pass@host:3306/dbname" },
  { value: "mongodb",    label: "MongoDB",    placeholder: "mongodb+srv://user:pass@cluster.mongodb.net/dbname" },
];

type Tab = "ai" | "database";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("ai");

  // AI state
  const [provider, setProvider] = useState("mock");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiError, setAiError] = useState("");

  // DB state
  const [dbType, setDbType] = useState("postgresql");
  const [dbLabel, setDbLabel] = useState("");
  const [connStr, setConnStr] = useState("");
  const [hasDb, setHasDb] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    apiFetch<{ ai_provider: string; ai_model: string; has_ai_key: boolean; db_type: string | null; db_label: string; has_db: boolean }>("/settings").then((res) => {
      if (res.success && res.data) {
        setProvider(res.data.ai_provider);
        setModel(res.data.ai_model ?? "");
        setHasKey(res.data.has_ai_key);
        if (res.data.db_type) setDbType(res.data.db_type);
        setDbLabel(res.data.db_label ?? "");
        setHasDb(res.data.has_db);
      }
    });
  }, []);

  const currentProvider = PROVIDERS.find((p) => p.value === provider);
  const currentDbType = DB_TYPES.find((d) => d.value === dbType);

  // ─── AI kaydet ───────────────────────────────────────────────────────────────
  async function saveAi() {
    setAiError(""); setAiSaving(true);
    const body: Record<string, string> = { ai_provider: provider, ai_model: model };
    if (apiKey.trim()) body.ai_api_key = apiKey.trim();
    const res = await apiFetch("/settings", { method: "PATCH", body: JSON.stringify(body) });
    setAiSaving(false);
    if (res.success) { setAiSaved(true); setApiKey(""); setHasKey(true); setTimeout(() => setAiSaved(false), 2500); }
    else setAiError(res.error ?? "Save failed");
  }

  // ─── DB bağlantı testi ────────────────────────────────────────────────────────
  async function testDb() {
    if (!connStr.trim()) { setDbError("Connection string is required"); return; }
    setDbError(""); setDbTesting(true); setDbTestResult(null);
    const res = await apiFetch<{ message: string }>("/settings/db/test", {
      method: "POST",
      body: JSON.stringify({ db_type: dbType, connection_string: connStr }),
    });
    setDbTesting(false);
    setDbTestResult({ ok: res.success, message: res.data?.message ?? res.error ?? "Unknown error" });
  }

  // ─── DB kaydet ────────────────────────────────────────────────────────────────
  async function saveDb() {
    if (!connStr.trim()) { setDbError("Connection string is required"); return; }
    setDbError(""); setDbSaving(true);
    const res = await apiFetch("/settings/db", {
      method: "PATCH",
      body: JSON.stringify({ db_type: dbType, db_label: dbLabel || dbType, connection_string: connStr }),
    });
    setDbSaving(false);
    if (res.success) { setDbSaved(true); setConnStr(""); setHasDb(true); setTimeout(() => setDbSaved(false), 2500); }
    else setDbError(res.error ?? "Save failed");
  }

  // ─── DB bağlantısını kaldır ───────────────────────────────────────────────────
  async function removeDb() {
    if (!confirm("Remove database connection?")) return;
    await apiFetch("/settings/db", { method: "PATCH", body: JSON.stringify({ connection_string: "" }) });
    setHasDb(false); setConnStr(""); setDbLabel(""); setDbTestResult(null);
  }

  const inputStyle = {
    width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "9px 12px", fontSize: 13, color: "var(--text)", outline: "none",
  };

  return (
    <div style={{ padding: "clamp(40px, 6vh, 80px) clamp(32px, 5vw, 64px)", maxWidth: 640 }}>
      <div className="label" style={{ marginBottom: 14 }}>Configuration</div>
      <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 10 }}>Settings</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: 32, letterSpacing: "0.01em" }}>
        Configure your AI provider and database integration.
      </p>

      {/* Sekmeler */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {(["ai", "database"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "8px 16px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--primary)" : "var(--text-muted)",
              borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
              marginBottom: -1,
            }}>
            {t === "ai" ? "AI Provider" : "Database"}
          </button>
        ))}
      </div>

      {/* ── AI SEKME ─────────────────────────────────────────────────────────── */}
      {tab === "ai" && (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12, padding: 24,
          boxShadow: "var(--shadow-card)",
        }}>
          <div style={{ marginBottom: 20 }}>
            <label className="label" style={{ display: "block", marginBottom: 10 }}>AI Provider</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PROVIDERS.map((p) => (
                <label key={p.value} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${provider === p.value ? "var(--primary)" : "var(--border)"}`,
                  background: provider === p.value ? "var(--bg-elevated)" : "var(--bg)",
                }}>
                  <input type="radio" name="provider" value={p.value} checked={provider === p.value}
                    onChange={() => { setProvider(p.value); setModel(""); }}
                    style={{ accentColor: "var(--primary)" }} />
                  <span style={{ fontSize: 13 }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {currentProvider && currentProvider.models.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label className="label" style={{ display: "block", marginBottom: 10 }}>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
                <option value="">Default</option>
                {currentProvider.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {provider !== "mock" && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
                API KEY {hasKey && <span style={{ color: "var(--success)" }}>● Saved</span>}
              </label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "Enter new key to replace..." : currentProvider?.placeholder}
                style={{ ...inputStyle, fontFamily: "monospace" }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                {provider === "claude" && "Get your key at console.anthropic.com"}
                {provider === "gemini" && "Get your key at aistudio.google.com"}
              </div>
            </div>
          )}

          {aiError && <div style={{ fontSize: 12, color: "var(--error)", marginBottom: 12 }}>{aiError}</div>}
          <button onClick={saveAi} disabled={aiSaving} style={{
            background: aiSaved ? "var(--success)" : "var(--primary)", color: "#fff",
            border: "none", borderRadius: 6, padding: "10px 24px", fontSize: 13,
            fontWeight: 600, cursor: aiSaving ? "not-allowed" : "pointer",
          }}>
            {aiSaving ? "Saving..." : aiSaved ? "✓ Saved!" : "Save Settings"}
          </button>
        </div>
      )}

      {/* ── DATABASE SEKME ────────────────────────────────────────────────────── */}
      {tab === "database" && (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12, padding: 24,
          boxShadow: "var(--shadow-card)",
        }}>
          {/* Mevcut bağlantı varsa göster */}
          {hasDb && !connStr && (
            <div style={{
              background: "rgba(34,197,94,0.08)", border: "1px solid var(--success)",
              borderRadius: 8, padding: "12px 16px", marginBottom: 20,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <span style={{ color: "var(--success)", marginRight: 8 }}>●</span>
                <span style={{ fontSize: 13 }}>Database connected</span>
                {dbLabel && <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>({dbLabel})</span>}
              </div>
              <button onClick={removeDb} style={{
                fontSize: 11, color: "var(--error)", background: "none", border: "none", cursor: "pointer",
              }}>Remove</button>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ display: "block", marginBottom: 10 }}>Database Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {DB_TYPES.map((d) => (
                <button key={d.value} onClick={() => { setDbType(d.value); setDbTestResult(null); }}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${dbType === d.value ? "var(--primary)" : "var(--border)"}`,
                    background: dbType === d.value ? "var(--bg-elevated)" : "var(--bg)",
                    color: dbType === d.value ? "var(--primary)" : "var(--text-muted)",
                    fontWeight: dbType === d.value ? 600 : 400,
                  }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ display: "block", marginBottom: 10 }}>Label (optional)</label>
            <input value={dbLabel} onChange={(e) => setDbLabel(e.target.value)}
              placeholder="e.g. Orders Database" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ display: "block", marginBottom: 10 }}>
              Connection String {hasDb && !connStr && <span style={{ color: "var(--success)", fontWeight: 600 }}>● connected</span>}
            </label>
            <input type="password" value={connStr} onChange={(e) => { setConnStr(e.target.value); setDbTestResult(null); }}
              placeholder={hasDb ? "Enter new connection string to replace..." : currentDbType?.placeholder}
              style={{ ...inputStyle, fontFamily: "monospace" }} />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
              Connection string is encrypted with AES-256-GCM before storage.
            </div>
          </div>

          {/* Test sonucu */}
          {dbTestResult && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13,
              background: dbTestResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${dbTestResult.ok ? "var(--success)" : "var(--error)"}`,
              color: dbTestResult.ok ? "var(--success)" : "var(--error)",
            }}>
              {dbTestResult.ok ? "✓ " : "✗ "}{dbTestResult.message}
            </div>
          )}

          {dbError && <div style={{ fontSize: 12, color: "var(--error)", marginBottom: 12 }}>{dbError}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={testDb} disabled={dbTesting || !connStr.trim()} style={{
              background: "var(--bg-hover)", color: "var(--text)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "10px 20px", fontSize: 13, fontWeight: 500,
              cursor: (dbTesting || !connStr.trim()) ? "not-allowed" : "pointer",
            }}>
              {dbTesting ? "Testing..." : "Test Connection"}
            </button>
            <button onClick={saveDb} disabled={dbSaving || !connStr.trim()} style={{
              background: dbSaved ? "var(--success)" : "var(--primary)", color: "#fff",
              border: "none", borderRadius: 6, padding: "10px 24px", fontSize: 13,
              fontWeight: 600, cursor: (dbSaving || !connStr.trim()) ? "not-allowed" : "pointer",
            }}>
              {dbSaving ? "Saving..." : dbSaved ? "✓ Saved!" : "Save Connection"}
            </button>
          </div>

          <div style={{ marginTop: 20, padding: "14px 16px", background: "var(--bg)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--text)" }}>How it works:</strong><br />
            Once connected, your AI agent can query this database in real-time to answer customer questions about orders, inventory, accounts, and more. Only SELECT queries are allowed — the AI cannot modify your data.
          </div>
        </div>
      )}
    </div>
  );
}
