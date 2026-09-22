"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { clearAuth, isLoggedIn } from "../lib/api";

const NAV = [
  { href: "/",          label: "Dashboard", icon: "▦" },
  { href: "/documents", label: "Documents", icon: "◧" },
  { href: "/chat",      label: "Chat",      icon: "◉" },
  { href: "/workspace", label: "Workspace", icon: "◈" },
  { href: "/settings",  label: "Settings",  icon: "⚙" },
];

export function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [loggedIn,    setLoggedIn]    = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [initials,    setInitials]    = useState("?");

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    const name = localStorage.getItem("ai_support_company") ?? "";
    setCompanyName(name);
    setInitials(name ? name.slice(0, 2).toUpperCase() : "?");
  }, []);

  function logout() {
    clearAuth();
    router.push("/login");
  }

  return (
    <aside style={{
      width: 216, minWidth: 216,
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Logo */}
      <div style={{
        padding: "20px 18px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "var(--r-md)", flexShrink: 0,
            background: "var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: "#fff", fontWeight: 700,
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          }}>A</div>
          <span style={{
            fontSize: 14, fontWeight: 600,
            letterSpacing: "-0.02em", color: "var(--text)",
          }}>AI Support</span>
        </div>
        <div style={{
          fontSize: 11, color: "var(--text-muted)",
          marginTop: 5, paddingLeft: 35,
          letterSpacing: "0.01em",
        }}>Agent Platform</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px" }}>
        {NAV.map((item, i) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "8px 10px", borderRadius: "var(--r-md)", marginBottom: 1,
              fontSize: 13.5, fontWeight: active ? 600 : 400,
              color: active ? "var(--text)" : "var(--text-secondary)",
              background: active ? "rgba(17,17,16,0.07)" : "transparent",
              borderLeft: active ? "2px solid var(--text)" : "2px solid transparent",
              textDecoration: "none",
              transition: "all 0.15s var(--ease)",
              animation: `slideIn 0.3s var(--ease) ${i * 0.04}s both`,
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = "rgba(17,17,16,0.04)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }
            }}>
              <span style={{
                fontSize: 12,
                opacity: active ? 0.9 : 0.45,
                color: "inherit",
              }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 10px" }}>
        {loggedIn ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "var(--r-sm)", flexShrink: 0,
              background: "var(--bg-active)",
              border: "1px solid var(--border-mid)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "var(--text)",
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: "var(--text)",
              }}>
                {companyName || "My Company"}
              </div>
              <button onClick={logout} style={{
                fontSize: 11, color: "var(--text-muted)", background: "none",
                border: "none", padding: 0, cursor: "pointer",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--error)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <Link href="/login" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
            Sign in →
          </Link>
        )}
      </div>
    </aside>
  );
}
