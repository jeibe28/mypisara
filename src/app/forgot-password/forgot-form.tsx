"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth-shell";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (result.error) throw new Error(result.error.message || "Couldn't send the email.");
      setSent(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Couldn't send the email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      {sent ? (
        <>
          <h2>Check your email</h2>
          <p>
            If an account exists for <strong>{email.trim()}</strong>, a link to choose a new password is on its way.
            It works for one hour.
          </p>
          <p className="auth-hint">
            <MailCheck size={16} /> Nothing arrived? Check spam, or try again in a minute.
          </p>
          <Link className="btn" href="/login">Back to sign in</Link>
        </>
      ) : (
        <>
          <h2>Forgot your password?</h2>
          <p>Enter your email and we&apos;ll send you a link to choose a new one.</p>
          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input required type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn btn-primary" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send reset link"}
              <ArrowRight size={17} />
            </button>
            <Link className="text-button" href="/login">Back to sign in</Link>
          </form>
        </>
      )}
    </AuthShell>
  );
}
