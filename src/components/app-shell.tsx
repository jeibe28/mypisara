"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { defaultPreferences, readPreferences, savePreferences, type Preferences } from "@/lib/preferences";
import { Brand } from "./brand";
import { AppProvider, useApp, type AppUser, type DashboardPrefs } from "./app-context";

function Account() {
  const { demo, user, href } = useApp();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  if (demo)
    return (
      <div className="topbar-demo">
        <span>Demo · saved in this browser</span>
        <Link className="icon-btn" href={href("/settings")} aria-label="Settings">
          <Settings size={17} />
        </Link>
        <Link className="btn btn-secondary" href="/login">Sign in</Link>
      </div>
    );
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div className="account" ref={menu}>
      <button className="account-avatar" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {user.image ? <img src={user.image} alt="" /> : initials}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <Link role="menuitem" className="account-link" href="/settings" onClick={() => setOpen(false)}>
            <Settings size={15} />
            Settings
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/login";
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  demo,
  user,
  preferences,
  emailEnabled = false,
  dashboard = null,
  children,
}: {
  demo: boolean;
  user: AppUser;
  preferences: Preferences | null;
  emailEnabled?: boolean;
  dashboard?: DashboardPrefs | null;
  children: ReactNode;
}) {
  // The account's saved preferences follow the user across devices. A first
  // sign-in on a device that already has custom settings uploads them instead.
  useEffect(() => {
    if (preferences) return savePreferences(preferences);
    if (!user) return;
    const local = readPreferences();
    if (JSON.stringify(local) === JSON.stringify(defaultPreferences)) return;
    fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(local),
    }).catch(() => undefined);
  }, [preferences, user]);
  return (
    <AppProvider demo={demo} user={user} emailEnabled={emailEnabled} dashboard={dashboard}>
      <div className="app-shell">
        <header className="topbar">
          <Brand href={demo ? "/demo" : "/"} />
          <Account />
        </header>
        <main className="app-main">{children}</main>
      </div>
    </AppProvider>
  );
}
