"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../lib/api";

interface Conversation {
  id: string;
  status: "active" | "escalated" | "resolved";
  channel: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  message_count: number;
  escalated_at: string | null;
  metadata: Record<string, string>;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "agent" | "system" | "tool";
  content: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  escalated: "var(--error)",
  active: "var(--primary)",
  resolved: "var(--success)",
};

const STATUS_LABELS: Record<string, string> = {
  escalated: "Escalated",
  active: "Active",
  resolved: "Resolved",
};

const ROLE_LABELS: Record<string, string> = {
  user: "Customer",
  assistant: "AI",
  agent: "Agent",
  system: "System",
  tool: "Tool",
};

export default function WorkspacePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convDetail, setConvDetail] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState<"all" | "escalated" | "active" | "resolved">("all");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Konuşma listesini yükle + 5s'de bir yenile
  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  // Seçili konuşmayı yükle + 3s'de bir yenile
  useEffect(() => {
    if (!selected) return;
    loadMessages(selected);
    const interval = setInterval(() => loadMessages(selected), 3000);
    return () => clearInterval(interval);
  }, [selected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
    const url = filter === "all" ? "/workspace/conversations" : `/workspace/conversations?status=${filter}`;
    const res = await apiFetch<Conversation[]>(url);
    if (res.success && res.data) {
      setConversations(res.data);
      setLoading(false);
    }
  }

  async function loadMessages(id: string) {
    const res = await apiFetch<{ conversation: Conversation; messages: Message[] }>(`/workspace/conversations/${id}`);
    if (res.success && res.data) {
      setMessages(res.data.messages);
      setConvDetail(res.data.conversation);
    }
  }

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    await apiFetch(`/workspace/conversations/${selected}/reply`, {
      method: "POST",
      body: JSON.stringify({ content: reply }),
    });
    setReply("");
    setSending(false);
    await loadMessages(selected);
  }

  async function changeStatus(status: "active" | "resolved") {
    if (!selected) return;
    await apiFetch(`/workspace/conversations/${selected}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadConversations();
    await loadMessages(selected);
  }

  const escalatedCount = conversations.filter((c) => c.status === "escalated").length;
  const filtered = filter === "all" ? conversations : conversations.filter((c) => c.status === filter);

  const inputStyle = {
    background: "var(--bg)", border: "1px solid var(--border)",
    borderRadius: 6, color: "var(--text)", outline: "none",
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* ── Sol panel: Konuşma listesi ─────────────────────────────────────── */}
      <div style={{ width: 320, minWidth: 320, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>

        {/* Başlık */}
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Agent Workspace</h2>
            {escalatedCount > 0 && (
              <span style={{
                background: "var(--error)", color: "#fff",
                borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700,
              }}>{escalatedCount} escalated</span>
            )}
          </div>

          {/* Filtre butonları */}
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {(["all", "escalated", "active", "resolved"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                ...inputStyle, padding: "4px 10px", fontSize: 11, cursor: "pointer",
                background: filter === f ? "var(--primary)" : "var(--bg-hover)",
                color: filter === f ? "#fff" : "var(--text-muted)",
                border: filter === f ? "1px solid var(--primary)" : "1px solid var(--border)",
                fontWeight: filter === f ? 600 : 400,
              }}>
                {f === "all" ? "All" : STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>No conversations</div>
          ) : (
            filtered.map((conv) => (
              <div key={conv.id} onClick={() => setSelected(conv.id)}
                style={{
                  padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                  background: selected === conv.id ? "var(--bg-hover)" : "transparent",
                  borderLeft: conv.status === "escalated" ? "3px solid var(--error)" : "3px solid transparent",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {conv.customer_name || conv.customer_email || conv.customer_phone || "Anonymous"}
                  </span>
                  <span style={{ fontSize: 10, color: STATUS_COLORS[conv.status], fontWeight: 700 }}>
                    {STATUS_LABELS[conv.status]}
                  </span>
                </div>
                {conv.last_message && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.last_message}
                  </div>
                )}
                {conv.status === "escalated" && conv.metadata?.escalation_reason && (
                  <div style={{ fontSize: 11, color: "var(--error)", marginTop: 4 }}>
                    ↑ {conv.metadata.escalation_reason}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {conv.channel} · {conv.message_count} messages
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Sağ panel: Seçili konuşma ─────────────────────────────────────── */}
      {!selected ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 14 }}>
          Select a conversation to view
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Konuşma başlığı */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {convDetail?.customer_name || convDetail?.customer_email || "Anonymous"}
              </span>
              {convDetail?.customer_phone && (
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{convDetail.customer_phone}</span>
              )}
              <span style={{ fontSize: 12, color: STATUS_COLORS[convDetail?.status ?? "active"], marginLeft: 10, fontWeight: 600 }}>
                ● {STATUS_LABELS[convDetail?.status ?? "active"]}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {convDetail?.status !== "resolved" && (
                <button onClick={() => changeStatus("resolved")} style={{
                  ...inputStyle, padding: "6px 14px", fontSize: 12, cursor: "pointer",
                  background: "rgba(34,197,94,0.1)", border: "1px solid var(--success)", color: "var(--success)",
                }}>
                  ✓ Resolve
                </button>
              )}
              {convDetail?.status === "resolved" && (
                <button onClick={() => changeStatus("active")} style={{
                  ...inputStyle, padding: "6px 14px", fontSize: 12, cursor: "pointer",
                }}>
                  Reopen
                </button>
              )}
            </div>
          </div>

          {/* Mesajlar */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg) => {
              const isCustomer = msg.role === "user";
              const isAgent = msg.role === "agent";
              const isAI = msg.role === "assistant";
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isCustomer ? "flex-start" : "flex-end" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>
                    {ROLE_LABELS[msg.role]} · {new Date(msg.created_at).toLocaleTimeString("tr-TR")}
                  </div>
                  <div style={{
                    maxWidth: "70%", padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                    background: isCustomer ? "var(--bg-elevated)" : isAgent ? "rgba(21,128,61,0.07)" : isAI ? "var(--bg-card)" : "var(--bg)",
                    border: `1px solid ${isAgent ? "rgba(21,128,61,0.2)" : isAI ? "var(--border-mid)" : "var(--border)"}`,
                    color: "var(--text)",
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Cevap kutusu */}
          {convDetail?.status !== "resolved" && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Reply as agent... (Enter to send, Shift+Enter for newline)"
                rows={2}
                style={{
                  flex: 1, ...inputStyle, padding: "10px 12px", fontSize: 13,
                  resize: "none", fontFamily: "inherit",
                }}
              />
              <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
                background: "var(--primary)", color: "#fff", border: "none",
                borderRadius: 8, padding: "0 20px", fontSize: 13, fontWeight: 600,
                cursor: (sending || !reply.trim()) ? "not-allowed" : "pointer",
                opacity: (sending || !reply.trim()) ? 0.6 : 1,
              }}>
                {sending ? "..." : "Send"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
