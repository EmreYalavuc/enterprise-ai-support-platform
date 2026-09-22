"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../lib/api";
import { useReveal } from "../lib/useReveal";

interface Document {
  id: string;
  title: string;
  source_type: string;
  status: "processing" | "indexed" | "failed" | "pending";
  chunk_count: number;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  indexed:    { color: "var(--success)",  bg: "var(--success-dim)",  border: "rgba(34,197,94,0.2)",   label: "Indexed" },
  processing: { color: "var(--warning)",  bg: "var(--warning-dim)",  border: "rgba(245,158,11,0.2)",  label: "Processing" },
  pending:    { color: "var(--warning)",  bg: "var(--warning-dim)",  border: "rgba(245,158,11,0.2)",  label: "Pending" },
  failed:     { color: "var(--error)",    bg: "var(--error-dim)",    border: "rgba(239,68,68,0.2)",   label: "Failed" },
};

function ProcessingDot() {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: "50%",
          background: "var(--warning)",
          animation: `pulse-dot 1.2s ease ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

function DocCard({ doc, onDelete, index }: { doc: Document; onDelete: (id: string) => void; index: number }) {
  const cfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.failed;
  const [hovered, setHovered] = useState(false);
  return (
    <div className={`fade-up delay-${Math.min(index + 1, 5)}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${hovered ? "var(--border-mid)" : "var(--border)"}`,
        borderRadius: 12, padding: "16px 20px", marginBottom: 8,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all 0.2s var(--ease)",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
      }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14 }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: doc.status === "indexed" ? "var(--primary-dim)" : "var(--bg-elevated)",
          border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: doc.status === "indexed" ? "var(--text-secondary)" : "var(--text-muted)",
        }}>
          ◧
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.title}
            </span>
            <span style={{
              ...cfg, padding: "2px 8px", borderRadius: 99, fontSize: 10,
              fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
              background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            }}>
              {doc.status === "processing" || doc.status === "pending"
                ? <><ProcessingDot /><span style={{ marginLeft: 2 }}>{cfg.label}</span></>
                : <>{cfg.label}</>
              }
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
            <span>{doc.source_type}</span>
            <span>·</span>
            <span>{doc.chunk_count} chunk{doc.chunk_count !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      <button onClick={() => onDelete(doc.id)} style={{
        background: "none", border: "1px solid var(--border)",
        borderRadius: 7, padding: "5px 12px", fontSize: 11,
        color: "var(--text-muted)", marginLeft: 16, flexShrink: 0,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--error)";
        (e.currentTarget as HTMLElement).style.color = "var(--error)";
        (e.currentTarget as HTMLElement).style.background = "var(--error-dim)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        (e.currentTarget as HTMLElement).style.background = "none";
      }}>
        Delete
      </button>
    </div>
  );
}

export default function DocumentsPage() {
  const [docs,      setDocs]      = useState<Document[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");
  const [title,     setTitle]     = useState("");
  const [content,   setContent]   = useState("");
  const [success,   setSuccess]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadDocs() {
    const res = await apiFetch<Document[]>("/documents");
    if (res.success && res.data) setDocs(res.data);
    setLoading(false);
  }

  useEffect(() => {
    loadDocs();
    pollRef.current = setInterval(() => {
      setDocs((prev) => {
        if (prev.some((d) => d.status === "processing" || d.status === "pending")) loadDocs();
        return prev;
      });
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function upload() {
    if (!title.trim() || content.trim().length < 50) {
      setError("Title and at least 50 characters of content are required.");
      return;
    }
    setError(""); setUploading(true);
    const res = await apiFetch<Document>("/documents", {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), content: content.trim(), source_type: "text" }),
    });
    setUploading(false);
    if (res.success && res.data) {
      setDocs((prev) => [res.data!, ...prev]);
      setTitle(""); setContent(""); setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } else {
      setError(res.error ?? "Upload failed");
    }
  }

  async function deleteDoc(id: string) {
    await apiFetch(`/documents/${id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  const indexed = docs.filter((d) => d.status === "indexed").length;

  const headerReveal = useReveal();
  const formReveal   = useReveal();

  return (
    <div style={{ padding: "clamp(40px, 6vh, 80px) clamp(32px, 5vw, 64px)", maxWidth: 860 }}>

      {/* Header */}
      <div ref={headerReveal.ref} style={{
        marginBottom: "clamp(36px, 5vh, 60px)",
        opacity: headerReveal.visible ? 1 : 0,
        transform: headerReveal.visible ? "none" : "translateY(16px)",
        transition: "opacity 0.65s var(--ease), transform 0.65s var(--ease)",
      }}>
        <div className="label" style={{ marginBottom: 14 }}>Knowledge Base</div>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 10 }}>
          Documents
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          Upload content — the AI searches these when answering questions.
          {indexed > 0 && <span style={{ color: "var(--success)", marginLeft: 8, fontWeight: 600 }}>
            {indexed} indexed
          </span>}
        </p>
      </div>

      {/* Upload form */}
      <div ref={formReveal.ref} style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "28px 32px",
        marginBottom: "clamp(36px, 5vh, 56px)",
        boxShadow: "var(--shadow-card)",
        opacity: formReveal.visible ? 1 : 0,
        transform: formReveal.visible ? "none" : "translateY(20px)",
        transition: "opacity 0.65s var(--ease) 0.1s, transform 0.65s var(--ease) 0.1s",
      }}>
        <div className="label" style={{ marginBottom: 18 }}>Add Document</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title (e.g. Return Policy)"
            style={{ width: "100%", padding: "10px 14px" }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your document content here (minimum 50 characters)..."
            rows={5}
            style={{ width: "100%", padding: "10px 14px", resize: "vertical" }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "var(--error)", marginTop: 10, padding: "8px 12px", background: "var(--error-dim)", borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button onClick={upload} disabled={uploading} style={{
          marginTop: 14,
          background: success
            ? "linear-gradient(135deg, #16a34a, #22c55e)"
            : uploading ? "var(--bg-elevated)" : "var(--primary)",
          color: "#fff", border: "none", borderRadius: 9,
          padding: "11px 24px", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: !uploading && !success ? "0 1px 3px rgba(0,0,0,0.2), 0 4px 10px rgba(0,0,0,0.10)" : "none",
          transition: "all 0.2s var(--ease)",
        }}>
          {uploading && <span className="spinner" />}
          {uploading ? "Uploading..." : success ? "✓ Uploaded!" : "Upload & Index"}
        </button>
      </div>

      {/* Document list */}
      <div>
        <div className="label" style={{ marginBottom: 14 }}>
          {loading ? "Loading..." : `${docs.length} document${docs.length !== 1 ? "s" : ""}`}
        </div>

        {!loading && docs.length === 0 && (
          <div className="fade-in" style={{
            textAlign: "center", padding: "48px 0",
            color: "var(--text-muted)", fontSize: 13,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◧</div>
            No documents yet. Upload your first document above.
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12 }} />)}
          </div>
        ) : (
          docs.map((doc, i) => <DocCard key={doc.id} doc={doc} onDelete={deleteDoc} index={i} />)
        )}
      </div>
    </div>
  );
}
