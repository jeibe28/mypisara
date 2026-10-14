"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth-shell";

export function ResetForm({ token, expired }: { token: string; expired: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message || "This link has expired.");
      setDone(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : "This link has expired.");
    } finally {
      setBusy(false);
    }
  }

  if (expired)
    return (
      <AuthShell>
        <h2>This link has expired</h2>
        <p>Reset links work once and for one hour. Request a new one to continue.</p>
        <Link className="btn btn-primary" href="/forgot-password">
          Request a new link <ArrowRight size={17} />
        </Link>
      </AuthShell>
    );

  if (done)
    return (
      <AuthShell>
        <h2>Password updated</h2>
        <p>You can sign in with your new password. Other devices were signed out.</p>
        <Link className="btn btn-primary" href="/login">
          Sign in <ArrowRight size={17} />
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell>
      <h2>Choose a new password</h2>
      <p>Use at least 8 characters.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input required type="password" minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
          <ArrowRight size={17} />
        </button>
      </form>
    </AuthShell>
  );
}
