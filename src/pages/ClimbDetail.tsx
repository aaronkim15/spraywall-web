import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useNavigate, useParams } from "react-router-dom";
import { getWall, wallImageUrl, cachedWall } from "../api/walls";
import type { Wall as WallType } from "../api/walls";
import { getClimb, deleteClimb, sendClimb, deleteSend, rateClimb, unrateClimb } from "../api/climbs";
import type { ClimbDetail as ClimbDetailType } from "../api/climbs";
import { ROLE_COLORS, ROLE_ONHOLD } from "../lib/roles";
import { useAuth } from "../auth/AuthContext";
import { avatarUrl } from "../api/auth";

import { WALL_ID } from "../config";

export default function ClimbDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [wall, setWall] = useState<WallType | null>(() => cachedWall(WALL_ID));
  const [climb, setClimb] = useState<ClimbDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [logAttempts, setLogAttempts] = useState(1);
  const [logBusy, setLogBusy] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const overlayRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [w, c] = await Promise.all([getWall(WALL_ID), getClimb(id)]);
        setWall(w);
        setClimb(c);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load climb.");
      }
    })();
  }, [id]);

  const myId = user?.id;
  const myAscents = climb?.sends.filter((s) => s.user_id === myId) ?? [];

  async function onLogSend() {
    if (!id || !user) return;
    setLogBusy(true);
    setError(null);
    try {
      await sendClimb(id, logAttempts);
      setClimb(await getClimb(id)); // refresh list + count
      setLogAttempts(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log send.");
    } finally {
      setLogBusy(false);
    }
  }

  async function onRate(n: number) {
    if (!id || !user) return;
    setRatingBusy(true);
    setError(null);
    try {
      if (climb?.my_rating === n) await unrateClimb(id); // tap your current star to clear
      else await rateClimb(id, n);
      setClimb(await getClimb(id)); // refresh average + my_rating
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save rating.");
    } finally {
      setRatingBusy(false);
    }
  }

  async function onDeleteSend(sendId: string) {
    if (!id) return;
    if (!window.confirm("Remove this send?")) return;
    setError(null);
    try {
      await deleteSend(sendId);
      setClimb(await getClimb(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove send.");
    }
  }

  async function onDelete() {
    if (!id) return;
    if (!window.confirm("Delete this climb? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteClimb(id);
      navigate("/climbs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete climb.");
      setDeleting(false);
    }
  }

  function renderHolds() {
    if (!climb) return null;
    return (
      <>
        <svg className="wall-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {climb.holds.map((hold) => {
            if (!hold.points) return null;
            const pts = hold.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ");
            const color = ROLE_COLORS[hold.role] ?? "#9aa0a6";
            return (
              <polygon key={hold.id} points={pts} fill={color + "55"} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            );
          })}
        </svg>
        {climb.holds.map((hold) => {
          const text = ROLE_ONHOLD[hold.role];
          if (!text) return null;
          return (
            <div
              key={`lbl-${hold.id}`}
              className="hold-label"
              style={{ left: `${hold.x_pos * 100}%`, top: `${hold.y_pos * 100}%`, ["--role" as string]: ROLE_COLORS[hold.role] } as React.CSSProperties}
            >
              {text}
            </div>
          );
        })}
      </>
    );
  }

  const hasImage = !!(wall?.has_image && wall.image_width && wall.image_height);

  return (
    <div className="builder-screen">
      <div className="wall-topbar">
        <button className="link-btn" onClick={() => navigate("/climbs")}>&larr; Climbs</button>
        <span className="builder-count">{climb?.grade || ""}</span>
      </div>

      {error && <div className="wall-error">{error}</div>}

      {hasImage ? (
        <div className="wall-viewport wall-tap" onClick={() => setExpanded(true)}>
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={1}
            maxScale={8}
            centerOnInit
            centerZoomedOut
            limitToBounds
            doubleClick={{ disabled: true }}
            wheel={{ disabled: true }}
            pinch={{ disabled: true }}
            panning={{ disabled: true }}
          >
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%" }}>
              <div className="wall-stage" style={{ aspectRatio: `${wall!.image_width} / ${wall!.image_height}` }}>
                <img
                  src={wallImageUrl(WALL_ID, wall?.image_version ?? "0")}
                  alt="wall"
                  className="wall-img"
                  draggable={false}
                  width={wall?.image_width ?? undefined}
                  height={wall?.image_height ?? undefined}
                  onLoad={() => transformRef.current?.centerView(1, 0)}
                />
                {renderHolds()}
              </div>
            </TransformComponent>
          </TransformWrapper>
          <div className="expand-badge">⤢</div>
        </div>
      ) : (
        !error && <div className="wall-placeholder">Loading...</div>
      )}

      {climb && (
        <div className="climb-meta">
          <h2 className="climb-meta-name">{climb.name}</h2>
          {climb.setter_name && (
            <p className="climb-setter">
              Set by {climb.setter_name} · {new Date(climb.created_at).toLocaleDateString()}
            </p>
          )}
          <div className="climb-meta-tags">
            {climb.grade && <span className="meta-chip">{climb.grade}</span>}
            {climb.angle != null && <span className="meta-chip">{climb.angle}&deg;</span>}
            {climb.feet_rules && <span className="meta-chip">{climb.feet_rules}</span>}
            <span className="meta-chip">{climb.send_count} {climb.send_count === 1 ? "sender" : "senders"}</span>
          </div>

          <div className="rating-row">
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`star-btn${(climb.my_rating ?? 0) >= n ? " filled" : ""}`}
                  onClick={() => onRate(n)}
                  disabled={!user || ratingBusy}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >★</button>
              ))}
            </div>
            <span className="rating-avg">
              {climb.rating != null ? `${climb.rating} (${climb.rating_count})` : "No ratings yet"}
            </span>
          </div>

          {user && (
            <div className="log-send">
              <label className="log-attempts">
                Attempts
                <input
                  type="number"
                  min={1}
                  value={logAttempts}
                  onChange={(e) => setLogAttempts(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </label>
              <button className="btn-send" onClick={onLogSend} disabled={logBusy}>
                {logBusy ? "Logging..." : "Log a send"}
              </button>
            </div>
          )}
          {myAscents.length > 0 && (
            <p className="my-send-note">
              You've sent this {myAscents.length === 1 ? "once" : `${myAscents.length} times`}.
            </p>
          )}

          {climb.sends.length > 0 && (
            <div className="senders">
              {climb.sends.map((entry) => (
                <div key={entry.id} className="sender">
                  <span className="sender-avatar">
                    {entry.has_avatar
                      ? <img src={avatarUrl(entry.user_id, entry.avatar_version ?? "0")} alt="" />
                      : <span>{(entry.display_name?.[0] ?? "?").toUpperCase()}</span>}
                  </span>
                  <span className="sender-name">{entry.display_name}</span>
                  <span className="sender-meta">
                    {entry.attempts} {entry.attempts === 1 ? "try" : "tries"} · {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  {entry.user_id === myId && (
                    <button className="sender-del" onClick={() => onDeleteSend(entry.id)} aria-label="Remove send">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {climb.description && <p className="climb-meta-desc">{climb.description}</p>}
          <div className="climb-meta-actions">
            <button className="btn-secondary" onClick={() => navigate(`/climbs/${id}/edit`)}>Edit</button>
            <button className="btn-danger" onClick={onDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      )}

      {expanded && hasImage && (
        <div className="climb-fullscreen">
          <div className="wall-topbar">
            <button className="link-btn" onClick={() => setExpanded(false)}>✕ Close</button>
          </div>
          <div className="wall-viewport">
            <TransformWrapper
              ref={overlayRef}
              initialScale={1}
              minScale={1}
              maxScale={8}
              centerOnInit
              centerZoomedOut
              limitToBounds
              doubleClick={{ disabled: true }}
            >
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%" }}>
                <div className="wall-stage" style={{ aspectRatio: `${wall!.image_width} / ${wall!.image_height}` }}>
                  <img
                    src={wallImageUrl(WALL_ID, wall?.image_version ?? "0", true)}
                    alt="wall"
                    className="wall-img"
                    draggable={false}
                    width={wall?.image_width ?? undefined}
                    height={wall?.image_height ?? undefined}
                    onLoad={() => overlayRef.current?.centerView(1, 0)}
                  />
                  {renderHolds()}
                </div>
              </TransformComponent>
            </TransformWrapper>
          </div>
        </div>
      )}
    </div>
  );
}
