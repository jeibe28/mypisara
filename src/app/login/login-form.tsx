"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth-shell";

export function LoginForm({
  configured,
  signUpEnabled,
  resetEnabled,
}: {
  configured: boolean;
  signUpEnabled: boolean;
  resetEnabled: boolean;
}) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = signup
        ? await authClient.signUp.email({ email, password, name, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (result.error) throw new Error(result.error.message || "Unable to sign in.");
      window.location.href = "/";
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
          <h2>{configured ? (signup ? "Create your account" : "Welcome back") : "Try MyPisara"}</h2>
          <p>
            {configured
              ? signup
                ? "Your boards are private to you."
                : "Sign in to open your boards."
              : "Accounts aren't connected yet. The demo keeps boards in this browser."}
          </p>
          {configured ? (
            <form onSubmit={submit}>
              {signup && (
                <label className="field">
                  <span>Name</span>
                  <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={signup ? "new-password" : "current-password"}
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
                <ArrowRight size={17} />
              </button>
              {resetEnabled && !signup && (
                <Link className="text-button" href="/forgot-password">
                  Forgot your password?
                </Link>
              )}
              {signUpEnabled && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSignup(!signup);
                    setError("");
                  }}
                >
                  {signup ? "Already have an account? Sign in" : "New here? Create an account"}
                </button>
              )}
            </form>
          ) : (
            <Link className="btn btn-primary" href="/demo">
              Open the demo <ArrowRight size={17} />
            </Link>
          )}
    </AuthShell>
  );
}
