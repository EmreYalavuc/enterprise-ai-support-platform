"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  created_at: string;
}

interface Conversation {
  id: string;
  status: string;
  created_at: string;
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "14px 14px 14px 3px", padding: "12px 16px",
      }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className="fade-up" style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {/* AI avatar */}
      {!isUser && (
        <div style={{
          width: 26, height: 26, borderRadius: "var(--r-sm)", flexShrink: 0,
          background: "var(--primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, color: "#fff", fontWeight: 700, marginRight: 8, marginTop: 2,
        }}>AI</div>
      )}
      <div style={{
        maxWidth: "68%",
        background: isUser ? "var(--primary)" : "var(--bg-card)",
        border: isUser ? "none" : "1px solid var(--border)",
        borderRadius: isUser ? "var(--r-lg) var(--r-lg) var(--r-xs) var(--r-lg)" : "var(--r-lg) var(--r-lg) var(--r-lg) var(--r-xs)",
        padding: "11px 15px",
        fontSize: 13,
        lineHeight: 1.65,
        color: isUser ? "#fff" : "var(--text)",
        whiteSpace: "pre-wrap",
        boxShadow: isUser ? "0 1px 3px rgba(0,0,0,0.18), 0 3px 8px rgba(0,0,0,0.10)" : "var(--shadow-sm)",
      }}>
        {msg.content}
        {!isUser && (msg.tokens_input ?? 0) > 0 && (
          <div style={{
            fontSize: 10, color: "var(--text-subtle)",
            marginTop: 8, paddingTop: 6,
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 8,
          }}>
            <span>{msg.tokens_input}↑ {msg.tokens_output}↓ tok</span>
            <span>·</span>
            <span>${Number(msg.cost_usd ?? 0).toFixed(6)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [convId,    setConvId]    = useState<string | null>(null);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [error,     setError]     = useState("");
  const bottomRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      const res = await apiFetch<Conversation[]>("/conversations");
      if (res.success && res.data && res.data.length > 0) {
        const active = res.data.find((c) => c.status === "active") ?? res.data[0];
        setConvId(active.id);
        loadMessages(active.id);
      } else {
        const newConv = await apiFetch<Conversation>("/conversations", {
          method: "POST",
          body: JSON.stringify({ channel: "api" }),
        });
        if (newConv.success && newConv.data) setConvId(newConv.data.id);
      }
    }
    init();
  }, []);

  async function loadMessages(id: string) {
    const res = await apiFetch<Message[]>(`/conversations/${id}/messages`);
    if (res.success && res.data) setMessages(res.data);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    if (!input.trim() || !convId || sending) return;
    setError("");
    const text = input.trim();
    setInput("");
    setSending(true);
    const optimistic: Message = { id: "temp", role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    const res = await apiFetch<{ user: Message; assistant: Message }>(
      `/conversations/${convId}/messages`,
      { method: "POST", body: JSON.stringify({ content: text }) }
    );
    setSending(false);
    if (res.success && res.data) {
      setMessages((prev) => [...prev.filter((m) => m.id !== "temp"), res.data!.user, res.data!.assistant]);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== "temp"));
      setError(res.error ?? "Failed to send");
    }
  }

  async function newConversation() {
    const res = await apiFetch<Conversation>("/conversations", {
      method: "POST", body: JSON.stringify({ channel: "api" }),
    });
    if (res.success && res.data) { setConvId(res.data.id); setMessages([]); }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        padding: "18px 32px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(247, 246, 242, 0.88)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em" }}>Chat</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {convId ? `#${convId.slice(0, 8)}` : "No conversation"}
          </div>
        </div>
        <button onClick={newConversation} style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
          borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "var(--text-muted)",
          fontWeight: 500, letterSpacing: 0.2,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--primary-light)";
          (e.currentTarget as HTMLElement).style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }}>
          + New Chat
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Empty state */}
        {messages.length === 0 && !sending && (
          <div className="fade-in" style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", flex: 1, gap: 12, color: "var(--text-muted)",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "var(--r-lg)",
              background: "var(--primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, color: "#fff",
              boxShadow: "var(--shadow-md)",
            }}>◉</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
              How can I help you?
            </div>
            <div style={{ fontSize: 13, textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>
              Ask about orders, policies, or anything else. Try:
            </div>
            {["Where is my order ORD-1234?", "What is your return policy?", "I need help with a refund"].map((hint) => (
              <button key={hint} onClick={() => setInput(hint)} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "8px 16px", fontSize: 12,
                color: "var(--text-muted)", fontWeight: 400,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--primary)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}>
                {hint}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "16px 32px 20px",
        borderTop: "1px solid var(--border)",
        background: "rgba(7,7,11,0.9)", backdropFilter: "blur(8px)",
      }}>
        {error && (
          <div style={{ fontSize: 12, color: "var(--error)", marginBottom: 8, padding: "6px 10px", background: "var(--error-dim)", borderRadius: 6 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message… (Enter to send)"
            disabled={!convId || sending}
            rows={1}
            style={{
              flex: 1,
              background: "rgba(255, 255, 255, 0.88)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--border)",
              borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "var(--text)",
              outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5,
              transition: "border-color 0.15s, box-shadow 0.15s",
              maxHeight: 120, overflowY: "auto",
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || !convId || sending}
            style={{
              width: 44, height: 44, borderRadius: 12, border: "none", flexShrink: 0,
              background: input.trim() && !sending
                ? "var(--primary)"
                : "var(--bg-elevated)",
              color: "#fff", fontSize: 16, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: input.trim() && !sending ? "0 1px 3px rgba(0,0,0,0.2), 0 4px 10px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.2s var(--ease)",
            }}>
            {sending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "↑"}
          </button>
        </div>
      </div>
    </div>
  );
}
