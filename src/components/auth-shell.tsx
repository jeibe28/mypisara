import type { ReactNode } from "react";
import { Brand } from "./brand";

// Shared two-panel layout for sign in, password recovery and reset.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-art" aria-hidden="true">
        <Brand href="/demo" />
        <div className="auth-board">
          <i className="auth-note a" />
          <i className="auth-note b" />
          <i className="auth-note c" />
          <svg viewBox="0 0 300 120"><path d="M40 90 C 110 20, 190 20, 260 70" /></svg>
        </div>
        <div>
          <h1>
            Think on a board,
            <br />
            <em>not in a list.</em>
          </h1>
          <p>Notes, images, links and to-dos on one calm canvas.</p>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-box">{children}</div>
      </section>
    </main>
  );
}
