"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not send the magic link.";
      setErrorMsg(message);
      setStatus("error");
    }
  }

  async function signInWithGoogle() {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google sign-in failed.";
      setErrorMsg(message);
      setStatus("error");
    }
  }

  return (
    <main className="login-main">
      <div className="login-card">
        <h1 className="login-title">recall</h1>
        <p className="login-sub">
          Speak or type anything. Your AI second brain remembers the rest.
        </p>

        {status === "sent" ? (
          <div className="login-sent">
            <div className="login-sent-icon">✉️</div>
            <p>Check your email for a magic sign-in link.</p>
            <button className="ghost" onClick={() => setStatus("idle")}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="login-google"
              onClick={() => void signInWithGoogle()}
            >
              <GoogleIcon /> Continue with Google
            </button>

            <div className="login-divider"><span>or</span></div>

            <form className="login-form" onSubmit={(e) => void sendMagicLink(e)}>
              <input
                className="text-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <button type="submit" disabled={status === "sending" || !email.trim()}>
                {status === "sending" ? "Sending…" : "Email me a magic link"}
              </button>
            </form>
          </>
        )}

        {errorMsg && <p className="error-msg">{errorMsg}</p>}
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.58 2.68-3.9 2.68-6.61z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.99 8.99 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 8.99 8.99 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}
