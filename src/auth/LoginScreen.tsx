import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <h1>THE JUNGLE GYM</h1>
      <form onSubmit={onSubmit} className="auth-form">
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none" autoComplete="email" required
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
      <p className="auth-switch">No account? <Link to="/register">Create one</Link></p>
    </div>
  );
}
