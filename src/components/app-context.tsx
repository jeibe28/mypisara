"use client";
import { createContext, useContext, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

export type DashboardPrefs = {
  favorites: string[];
  sort: "recent" | "name" | "cards";
  layout: "grid" | "list";
  folders?: { id: string; name: string }[];
  board_folders?: Record<string, string>;
};
export type AppUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified?: boolean;
} | null;
type AppContext = {
  demo: boolean;
  user: AppUser;
  emailEnabled: boolean;
  dashboard: DashboardPrefs | null;
  href: (path: string) => string;
  go: (path: string) => void;
};
const Context = createContext<AppContext | null>(null);

export function AppProvider({
  demo,
  user,
  emailEnabled = false,
  dashboard = null,
  children,
}: {
  demo: boolean;
  user: AppUser;
  emailEnabled?: boolean;
  dashboard?: DashboardPrefs | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The board library is the home page; "/boards" is kept as its alias.
  const href = (path: string) => {
    const base = pathname.startsWith("/demo") ? "/demo" : "";
    const target = path === "/boards" || path === "/" ? "" : path;
    return base + target || "/";
  };
  return (
    <Context.Provider value={{ demo, user, emailEnabled, dashboard, href, go: (path) => router.push(href(path)) }}>
      {children}
    </Context.Provider>
  );
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider.");
  return value;
}
