import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RegisterScreen() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await register(email, password, displayName || undefined);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <h1>Create account</h1>
      <form onSubmit={onSubmit} className="auth-form">
        <input
          placeholder="Display name (optional)" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname"
        />
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none" autoComplete="email" required
        />
        <input
          type="password" placeholder="Password (min 8 chars)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password" required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Creating..." : "Create account"}</button>
      </form>
      <p className="auth-switch">Have an account? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
