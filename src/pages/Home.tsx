import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { wallImageUrl, prefetchWall, cachedWall } from "../api/walls";
import { avatarUrl } from "../api/auth";
import type { Wall as WallType } from "../api/walls";

import { WALL_ID } from "../config";

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [wall, setWall] = useState<WallType | null>(() => cachedWall(WALL_ID));

  // Warm the wall photo + holds so the next screen opens instantly.
  useEffect(() => {
    prefetchWall(WALL_ID).then(setWall).catch(() => {});
  }, []);

  // Background-warm the FULL-RES wall image so the first zoom is instant.
  // One shared file for the whole app, cached immutably, so this runs once per device.
  useEffect(() => {
    const version = wall?.image_version;
    if (!version || version === "0") return; // no real image yet; skip

    const img = new Image();
    img.setAttribute("fetchpriority", "low"); // yield to the visible background
    img.src = wallImageUrl(WALL_ID, version, true); // full-res; setting .src fills the cache
  }, [wall?.image_version]);

  return (
    <div className="home-screen">
      <div
        className="home-bg"
        style={{ backgroundImage: `url(${wallImageUrl(WALL_ID, wall?.image_version ?? "0")})` }}
      />
      <div className="home-scrim" />

      <button className="home-profile" onClick={() => navigate("/profile")} aria-label="Profile">
        {user?.has_avatar ? (
          <img src={avatarUrl(user.id, user.avatar_version ?? "0")} alt="" />
        ) : (
          <span>{(user?.email?.[0] ?? "?").toUpperCase()}</span>
        )}
      </button>

      <div className="home-brand">
        <div className="home-logo">
          <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
            <path d="M6 36 L18 14 L26 26 L31 19 L42 36 Z" fill="#fff" />
          </svg>
        </div>
        <h1 className="home-title">THE JUNGLE GYM</h1>
        <p className="home-tagline">SET · LOG · CLIMB</p>
      </div>

      <div className="home-actions">
        <button className="home-btn home-btn-dark" onClick={() => navigate("/wall")}>
          Set up wall
        </button>
        <button className="home-btn home-btn-primary" onClick={() => navigate("/climbs/new")}>
          + CREATE CLIMB
        </button>
        <button className="home-btn home-btn-ghost" onClick={() => navigate("/climbs")}>
          VIEW CLIMBS
        </button>
      </div>
    </div>
  );
}
