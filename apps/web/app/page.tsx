"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "./lib/api";
import { useReveal } from "./lib/useReveal";

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(ease * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return count;
}

function StatCard({ label, value, sub, color, icon, delay = 0 }: {
  label: string; value: number; sub: string; color?: string; icon: string; delay?: number;
}) {
  const animated = useCountUp(value);
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)", padding: "28px 32px", flex: 1, minWidth: 200,
      position: "relative", overflow: "hidden",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: `opacity 0.65s var(--ease) ${delay * 0.1}s, transform 0.65s var(--ease) ${delay * 0.1}s, border-color 0.2s, box-shadow 0.2s`,
      boxShadow: "var(--shadow-card)",
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.borderColor = "var(--border-mid)";
      el.style.transform = "translateY(-2px)";
      el.style.boxShadow = "var(--shadow-md)";
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.borderColor = "var(--border)";
      el.style.transform = visible ? "translateY(0)" : "translateY(20px)";
      el.style.boxShadow = "var(--shadow-card)";
    }}>
      <div style={{ fontSize: 18, marginBottom: 16, opacity: 0.5 }}>{icon}</div>
      <div className="label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{
        fontSize: "var(--text-2xl)", fontWeight: 700,
        color: color ?? "var(--text)", lineHeight: 1, letterSpacing: "-0.03em",
      }}>
        {animated}
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 8, letterSpacing: "0.02em" }}>
        {sub}
      </div>
    </div>
  );
}

function ServiceRow({ name, status }: { name: string; status: string }) {
  const ok = status === "ok";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: ok ? "var(--success)" : "var(--error)",
          boxShadow: `0 0 8px ${ok ? "var(--success)" : "var(--error)"}`,
        }} />
        <span style={{ fontSize: 13, textTransform: "capitalize", letterSpacing: "0.01em" }}>{name}</span>
      </div>
      <span className={`badge ${ok ? "badge-success" : "badge-error"}`}>
        {ok ? "operational" : "error"}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const [docs,      setDocs]      = useState(0);
  const [convs,     setConvs]     = useState(0);
  const [escalated, setEscalated] = useState(0);
  const [health,    setHealth]    = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const headerReveal = useReveal();
  const infraReveal  = useReveal();

  useEffect(() => {
    async function load() {
      const [docsRes, convsRes, workspaceRes, healthRes] = await Promise.all([
        apiFetch<unknown[]>("/documents"),
        apiFetch<unknown[]>("/conversations"),
        apiFetch<{ status: string }[]>("/workspace/conversations"),
        fetch("http://localhost:3000/health").then((r) => r.json()).catch(() => ({})),
      ]);
      setDocs(Array.isArray(docsRes.data) ? docsRes.data.length : 0);
      setConvs(Array.isArray(convsRes.data) ? convsRes.data.length : 0);
      if (Array.isArray(workspaceRes.data))
        setEscalated(workspaceRes.data.filter((c) => c.status === "escalated").length);
      setHealth(healthRes.checks ?? {});
      setLoading(false);
    }
    load();
  }, []);

  const padding = "clamp(40px, 6vh, 80px) clamp(32px, 5vw, 64px)";

  return (
    <div style={{ padding }}>

      {/* Header */}
      <div ref={headerReveal.ref} style={{
        marginBottom: "clamp(40px, 6vh, 72px)",
        opacity: headerReveal.visible ? 1 : 0,
        transform: headerReveal.visible ? "none" : "translateY(16px)",
        transition: "opacity 0.65s var(--ease), transform 0.65s var(--ease)",
      }}>
        <div className="label" style={{ marginBottom: 14 }}>Platform Overview</div>
        <h1 style={{
          fontSize: "var(--text-2xl)", fontWeight: 700,
          letterSpacing: "-0.025em", lineHeight: 1.1,
          marginBottom: 10,
        }}>
          Dashboard
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", letterSpacing: "0.01em" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      {loading ? (
        <div style={{ display: "flex", gap: 16, marginBottom: "clamp(40px, 6vh, 72px)" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ flex: 1, height: 160, borderRadius: "var(--r-lg)" }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, marginBottom: "clamp(40px, 6vh, 72px)", flexWrap: "wrap" }}>
          <StatCard label="Documents" value={docs}      sub={`${docs} files indexed in vector DB`}        color="var(--text-secondary)" icon="◧" delay={0} />
          <StatCard label="Conversations" value={convs} sub={`${convs} total sessions recorded`}          color="var(--text)"          icon="◉" delay={1} />
          <StatCard label="Needs attention" value={escalated} sub={escalated > 0 ? `${escalated} awaiting agent` : "All clear"} color={escalated > 0 ? "var(--warning)" : "var(--success)"} icon="◈" delay={2} />
        </div>
      )}

      {/* Infrastructure */}
      <div ref={infraReveal.ref} style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "28px 32px", maxWidth: 480,
        boxShadow: "var(--shadow-card)",
        opacity: infraReveal.visible ? 1 : 0,
        transform: infraReveal.visible ? "none" : "translateY(20px)",
        transition: "opacity 0.65s var(--ease) 0.3s, transform 0.65s var(--ease) 0.3s",
      }}>
        <div className="label" style={{ marginBottom: 18 }}>Infrastructure</div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}
          </div>
        ) : Object.entries(health).length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
            API offline — running on :3000?
          </div>
        ) : (
          <>
            {Object.entries(health).map(([svc, status]) => (
              <ServiceRow key={svc} name={svc} status={status} />
            ))}
            <div style={{ paddingTop: 16, fontSize: "var(--text-xs)", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
              Last checked {new Date().toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
