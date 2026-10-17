import { useAuth } from "../auth/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="home">
      <header className="home-header">
        <h1>SprayWall</h1>
        <button className="link-btn" onClick={logout}>Sign out</button>
      </header>
      <p>Signed in as {user?.display_name || user?.email}.</p>
      <p className="muted">The wall and climbs screens come next.</p>
    </div>
  );
}
