import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useNavigate, useParams } from "react-router-dom";
import { getWall, getHolds, wallImageUrl, cachedWall, cachedHolds } from "../api/walls";
import type { Hold, Wall as WallType } from "../api/walls";
import { createClimb, updateClimb, getClimb } from "../api/climbs";
import type { HoldRole } from "../api/climbs";
import { findHoldAtPoint } from "../utils/holds";
import { ROLE_COLORS, ROLE_ONHOLD, ROLE_LABELS } from "../lib/roles";

import { WALL_ID } from "../config";

// In-progress climbs are mirrored here so they survive Safari unloading the page.
// A draft is only restored if it was touched within the last 10 minutes.
const DRAFT_KEY = `spraywall_draft_${WALL_ID}`;
const DRAFT_TTL_MS = 10 * 60 * 1000; // 10 minutes
function loadDraft(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const draft = JSON.parse(raw);
    const savedAt = typeof draft.savedAt === "number" ? draft.savedAt : 0;
    if (Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY); // too old — dump it
      return {};
    }
    return draft;
  } catch {
    return {};
  }
}

// The order a hold cycles through on each tap; a further tap past "finish" clears it.
const CYCLE: HoldRole[] = ["hand", "start", "foot", "finish"];

// --- Dropdown options (placeholders — swap these arrays for your real sets) ---
const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12", "V13", "V14", "V15"];
const FEET_RULES = ["Open feet", "Feet follow hands", "Marked feet only", "Tracking", "No feet"];

export default function CreateClimb() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>(); // present only on /climbs/:id/edit
  const isEditing = !!editId;
  const [wall, setWall] = useState<WallType | null>(() => cachedWall(WALL_ID));
  const [holds, setHolds] = useState<Hold[]>(() => cachedHolds(WALL_ID) ?? []);
  const [selection, setSelection] = useState<Record<string, HoldRole>>(
    () => (isEditing ? {} : (loadDraft().selection as Record<string, HoldRole>) || {})
  ); // holdId -> role
  const [step, setStep] = useState<"holds" | "details">(
    () => (!isEditing && loadDraft().step === "details" ? "details" : "holds")
  );
  const [name, setName] = useState(() => (isEditing ? "" : (loadDraft().name as string) || ""));
  const [description, setDescription] = useState(() => (isEditing ? "" : (loadDraft().description as string) || ""));
  const [grade, setGrade] = useState(() => (isEditing ? "" : (loadDraft().grade as string) || ""));
  const [feetRules, setFeetRules] = useState(() => (isEditing ? "" : (loadDraft().feetRules as string) || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [w, h] = await Promise.all([getWall(WALL_ID), getHolds(WALL_ID)]);
        setWall(w);
        setHolds(h);
        if (editId) {
          const c = await getClimb(editId);
          setSelection(Object.fromEntries(c.holds.map((hold) => [hold.id, hold.role])));
          setName(c.name);
          setGrade(c.grade || "");
          setDescription(c.description || "");
          setFeetRules(c.feet_rules || "");
        }
      } catch (e) {
        console.log("load failed", e);
      }
    })();
  }, [editId]);

  // Save the in-progress climb on every change so it survives a page reload.
  useEffect(() => {
    if (isEditing) return; // edits load from the saved climb, not from a draft
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ selection, step, name, description, grade, feetRules, savedAt: Date.now() }));
    } catch {
      // storage can be full or blocked (private mode) — a lost draft is not fatal
    }
  }, [isEditing, selection, step, name, description, grade, feetRules]);

  function resetDraft() {
    setSelection({});
    setName("");
    setDescription("");
    setGrade("");
    setFeetRules("");
    setStep("holds");
    setError(null);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  // Tap a hold to advance it one step through CYCLE; a tap past the last type removes it.
  function handleTap(e: MouseEvent<HTMLDivElement>) {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;

    const hit = findHoldAtPoint({ x, y }, holds);
    if (!hit) return;

    setSelection((prev) => {
      const next = { ...prev };
      const current = next[hit.id];                   // undefined = not in the climb
      const idx = current ? CYCLE.indexOf(current) : -1;
      const upcoming = CYCLE[idx + 1];                // undefined once we step past "finish"
      if (!upcoming) delete next[hit.id];
      else next[hit.id] = upcoming;
      return next;
    });
  }

  // Step 1 -> Step 2: require at least one hold before moving to details.
  function goToDetails() {
    setError(null);
    // Every climb needs at least one start, one finish, and one hybrid hold.
    const roles = new Set(Object.values(selection));
    const missing: string[] = [];
    if (!roles.has("start")) missing.push("a start");
    if (!roles.has("finish")) missing.push("a finish");
    if (!roles.has("hand")) missing.push("a hybrid");
    if (missing.length > 0) {
      setError(`Add ${missing.join(", ")} hold.`);
      return;
    }
    // Cap starts and finishes at 2 each.
    const counts = Object.values(selection).reduce<Record<string, number>>((acc, r) => {
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const tooMany: string[] = [];
    if ((counts.start || 0) > 2) tooMany.push("2 start");
    if ((counts.finish || 0) > 2) tooMany.push("2 finish");
    if (tooMany.length > 0) {
      setError(`Max ${tooMany.join(" and ")} holds.`);
      return;
    }
    setStep("details");
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) { setError("Give the climb a name."); return; }
    const holdsPayload = Object.entries(selection).map(([id, role]) => ({ id, role }));
    if (holdsPayload.length === 0) { setError("Select at least one hold."); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateClimb(editId, {
          name: name.trim(),
          grade: grade || null,
          description: description.trim() || null,
          feetRules: feetRules || null,
          holds: holdsPayload,
        });
        navigate(`/climbs/${editId}`);
      } else {
        await createClimb({
          name: name.trim(),
          grade: grade || null,
          description: description.trim() || null,
          feetRules: feetRules || null,
          wallId: WALL_ID,
          holds: holdsPayload,
        });
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        navigate("/climbs");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save climb.");
    } finally {
      setSaving(false);
    }
  }

  const hasImage = !!(wall?.has_image && wall.image_width && wall.image_height);
  const selectedCount = Object.keys(selection).length;

  // ---------- STEP 2: details form ----------
  if (step === "details") {
    return (
      <div className="builder-screen">
        <div className="wall-topbar">
          <button className="link-btn" onClick={() => { setError(null); setStep("holds"); }}>&larr; Holds</button>
          <span className="builder-count">{selectedCount} selected</span>
        </div>

        <div className="details-form">
          {error && <div className="wall-error">{error}</div>}

          <label className="field">
            <span className="field-label">Name</span>
            <input placeholder="Climb name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              placeholder="Beta, intent, anything worth noting..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Grade</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Select grade</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Feet rules</span>
            <select value={feetRules} onChange={(e) => setFeetRules(e.target.value)}>
              <option value="">Select feet rules</option>
              {FEET_RULES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>

          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Save changes" : "Save climb"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- STEP 1: pick + tag holds ----------
  return (
    <div className="builder-screen">
      <div className="wall-topbar">
        <button className="link-btn" onClick={() => navigate("/home")}>&larr; Home</button>
        <span className="builder-count">{selectedCount} selected</span>
      </div>

      {hasImage ? (
        <div className="wall-viewport">
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={1}
            maxScale={8}
            centerOnInit
            centerZoomedOut
            limitToBounds
            doubleClick={{ disabled: true }}
          >
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%" }}>
              <div
                className="wall-stage"
                style={{ aspectRatio: `${wall!.image_width} / ${wall!.image_height}` }}
                onClick={handleTap}
              >
                <img
                  ref={imgRef}
                  src={wallImageUrl(WALL_ID, wall?.image_version ?? "0")}
                  alt="wall"
                  className="wall-img"
                  draggable={false}
                  onLoad={() => transformRef.current?.centerView(1, 0)}
                />
                <svg className="wall-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                  {holds.map((hold) => {
                    if (!hold.points) return null;
                    const pts = hold.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ");
                    const role = selection[hold.id];
                    return (
                      <polygon
                        key={hold.id}
                        points={pts}
                        fill={role ? ROLE_COLORS[role] + "55" : "none"}
                        stroke={role ? ROLE_COLORS[role] : "rgba(255,255,255,0.35)"}
                        strokeWidth={role ? 3 : 1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </svg>
                {holds.map((hold) => {
                  const role = selection[hold.id];
                  if (!role) return null;
                  const text = ROLE_ONHOLD[role];
                  if (!text) return null;
                  return (
                    <div
                      key={`lbl-${hold.id}`}
                      className="hold-label"
                      style={{ left: `${hold.x_pos * 100}%`, top: `${hold.y_pos * 100}%`, ["--role" as string]: ROLE_COLORS[role] } as React.CSSProperties}
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>
      ) : (
        <div className="wall-placeholder">No wall photo yet. Set up the wall first.</div>
      )}

      <div className="builder-form">
        {error && <div className="wall-error">{error}</div>}

        <div className="role-legend">
          <span className="role-legend-hint">Tap a hold to cycle its type</span>
          <div className="role-legend-chips">
            {CYCLE.map((role) => (
              <span key={role} className="role-chip">
                <span
                  className="role-chip-dot"
                  style={{ background: ROLE_COLORS[role], borderColor: role === "hand" ? "rgba(0,0,0,0.35)" : ROLE_COLORS[role] }}
                />
                {ROLE_LABELS[role]}
              </span>
            ))}
          </div>
        </div>

        <div className="builder-actions">
          {!isEditing && <button className="btn-ghost" onClick={resetDraft}>Reset</button>}
          <button className="btn-primary" onClick={goToDetails}>Next</button>
        </div>
      </div>
    </div>
  );
}
