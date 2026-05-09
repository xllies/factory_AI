import { Suspense } from "react";
import { LoginClient } from "./login-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="login-main">
      <div className="login-card">
        <div className="login-head">
          <span className="login-eyebrow">recall</span>
          <h1 className="login-title">Sign in</h1>
        </div>
        <p className="login-sub">Loading…</p>
      </div>
    </main>
  );
}
