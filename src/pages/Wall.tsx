import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent, ChangeEvent } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useNavigate } from "react-router-dom";
import {
  getWall, getHolds, addHold, removeHold, detectHolds, cachedWall, cachedHolds,
  uploadPhoto, removePhoto, refineOutlines, wallImageUrl,
} from "../api/walls";
import type { Hold, Point, Wall as WallType } from "../api/walls";
import { findHoldAtPoint } from "../utils/holds";
import CropModal from "../components/CropModal";

import { WALL_ID } from "../config";
const MIN_SPACING = 0.004; // skip points closer than this while drawing

type Mode = "draw" | "remove";

export default function Wall() {
  const navigate = useNavigate();
  const [wall, setWall] = useState<WallType | null>(() => cachedWall(WALL_ID));
  const [holds, setHolds] = useState<Hold[]>(() => cachedHolds(WALL_ID) ?? []);
  const [mode, setMode] = useState<Mode>("draw");
  const [current, setCurrent] = useState<Point[]>([]);   // live stroke being drawn
  const [drafts, setDrafts] = useState<Point[][]>([]);   // finished, unsaved outlines
  const [refined, setRefined] = useState(false);         // have drafts been through SAM?
  const [refineStatus, setRefineStatus] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [savingOutlines, setSavingOutlines] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [multiTouch, setMultiTouch] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const draftRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const pointers = useRef<Set<number>>(new Set());

  async function load() {
    try {
      const [w, h] = await Promise.all([getWall(WALL_ID), getHolds(WALL_ID)]);
      setWall(w);
      setHolds(h);
    } catch (e) {
      console.log("load failed", e);
    }
  }
  useEffect(() => { load(); }, []);

  // Leaving draw mode drops the in-progress stroke but keeps finished drafts.
  useEffect(() => { if (mode !== "draw") setCurrent([]); }, [mode]);

  function pointFromEvent(e: { clientX: number; clientY: number }): Point | null {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x, y };
  }

  // Remove mode uses taps. (Draw mode uses the pointer handlers below.)
  function handleTap(e: MouseEvent<HTMLDivElement>) {
    if (mode !== "remove") return;
    const point = pointFromEvent(e);
    if (!point) return;
    const hit = findHoldAtPoint(point, holds);
    if (hit) doRemove(hit.id);
  }

  // --- freehand brush (draw mode) ---
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.add(e.pointerId);
    if (mode !== "draw") return;
    if (pointers.current.size >= 2) {
      drawingRef.current = false;
      draftRef.current = [];
      setCurrent([]);
      setMultiTouch(true);
      return;
    }
    const p = pointFromEvent(e);
    if (!p) return;
    drawingRef.current = true;
    draftRef.current = [p];
    setCurrent([p]);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "draw" || !drawingRef.current || pointers.current.size !== 1) return;
    const p = pointFromEvent(e);
    if (!p) return;
    const arr = draftRef.current;
    const last = arr[arr.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_SPACING) return;
    arr.push(p);
    setCurrent([...arr]);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) setMultiTouch(false);
    if (mode !== "draw" || !drawingRef.current || pointers.current.size !== 0) return;
    drawingRef.current = false;
    const pts = draftRef.current;
    draftRef.current = [];
    setCurrent([]);
    if (pts.length >= 3) {
      setDrafts((prev) => [...prev, pts]); // collect, do NOT save yet
      setRefined(false);
      setRefineStatus(null);
    }
  }

  async function doRemove(holdId: string) {
    try {
      await removeHold(holdId);
      setHolds((prev) => prev.filter((h) => h.id !== holdId));
    } catch (e) { console.log("remove failed", e); }
  }

  // --- draft outline controls ---
  function onClearDrafts() {
    setDrafts([]);
    setRefined(false);
    setRefineStatus(null);
  }

  async function onDone() {
    if (drafts.length === 0) return;
    setRefining(true);
    setRefineStatus(null);
    try {
      const res = await refineOutlines(WALL_ID, drafts);
      setDrafts(res.outlines);
      setRefined(res.refined);
      setRefineStatus(res.refined ? "Refined with SAM." : "SAM not enabled yet — outlines unchanged.");
    } catch (e) {
      console.log("refine failed", e);
      setRefineStatus("Couldn't refine. Outlines unchanged.");
    } finally {
      setRefining(false);
    }
  }

  async function onSaveOutlines() {
    if (drafts.length === 0) return;
    setSavingOutlines(true);
    try {
      for (const o of drafts) {
        const cx = o.reduce((s, p) => s + p.x, 0) / o.length;
        const cy = o.reduce((s, p) => s + p.y, 0) / o.length;
        await addHold(WALL_ID, { x_pos: cx, y_pos: cy, points: o });
      }
      setDrafts([]);
      setRefined(false);
      setRefineStatus(null);
      await load();
    } catch (e) {
      console.log("save outlines failed", e);
    } finally {
      setSavingOutlines(false);
    }
  }

  async function onDetect() {
    setDetecting(true);
    try { await detectHolds(WALL_ID); await load(); }
    catch (e) { console.log("detect failed", e); }
    finally { setDetecting(false); }
  }

  async function onPhotoChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    setCropFile(file); // open the crop step; the upload happens on confirm
  }

  async function onCropConfirm(cropped: File, w: number, h: number) {
    setCropFile(null);
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPhoto(WALL_ID, cropped, w, h);
      await load();
    } catch (err) {
      console.log("upload failed", err);
      setUploadError("That image couldn't be uploaded. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function onRemovePhoto() {
    if (!window.confirm("Remove the current wall photo?")) return;
    setUploading(true);
    try {
      await removePhoto(WALL_ID);
      await load();
    } catch (e) { console.log("remove photo failed", e); }
    finally { setUploading(false); }
  }

  const hasImage = !!(wall?.has_image && wall.image_width && wall.image_height);
  const busy = refining || savingOutlines;

  return (
    <div className="wall-screen">
      {cropFile && <CropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={onCropConfirm} />}
      <div className="wall-topbar">
        <button className="link-btn" onClick={() => navigate("/home")}>&larr; Home</button>
        <div className="mode-toggle">
          <button className={mode === "draw" ? "active" : ""} onClick={() => setMode("draw")}>Draw</button>
          <button className={mode === "remove" ? "active" : ""} onClick={() => setMode("remove")}>Remove</button>
        </div>
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
            panning={{ disabled: mode === "draw" && !multiTouch }}
          >
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%" }}>
              <div
                className="wall-stage"
                style={{
                  aspectRatio: `${wall!.image_width} / ${wall!.image_height}`,
                  touchAction: mode === "draw" ? "none" : undefined,
                }}
                onClick={handleTap}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
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
                    const isManual = hold.source === "manual";
                    return (
                      <polygon
                        key={hold.id}
                        points={pts}
                        fill={isManual ? "rgba(45,212,191,0.45)" : "none"}
                        stroke={isManual ? "#2dd4bf" : "#ff6b35"}
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}

                  {mode === "draw" && drafts.map((o, i) => (
                    <polygon
                      key={`draft-${i}`}
                      points={o.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                      fill={refined ? "rgba(45,212,191,0.35)" : "rgba(255,210,0,0.20)"}
                      stroke={refined ? "#2dd4bf" : "#ffd200"}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                    />
                  ))}

                  {mode === "draw" && current.length > 1 && (
                    <polyline
                      points={current.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                      fill="rgba(255,210,0,0.20)"
                      stroke="#ffd200"
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>
      ) : (
        <div className="wall-placeholder">No wall photo yet. Switch to Remove mode to add a photo below.</div>
      )}

      {mode === "draw" ? (
        <div className="draw-toolbar">
          <span className="draw-hint">
            {refineStatus || "Drag around each hold. Done to refine, Save to keep."}
          </span>
          <div className="draw-actions">
            <button className="btn-secondary" onClick={onClearDrafts} disabled={drafts.length === 0 || busy}>Clear</button>
            <button className="btn-secondary" onClick={onDone} disabled={drafts.length === 0 || busy}>
              {refining ? "Refining..." : "Refine"}
            </button>
            <button className="btn-primary" onClick={onSaveOutlines} disabled={drafts.length === 0 || busy}>
              {savingOutlines ? "Saving..." : `Save (${drafts.length})`}
            </button>
          </div>
        </div>
      ) : (
        <>
          {uploadError && <div className="wall-error">{uploadError}</div>}
          <div className="wall-bottombar">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoChosen} />
            <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading..." : "Replace photo"}
            </button>
            {hasImage && (
              <button className="btn-secondary" onClick={onRemovePhoto} disabled={uploading}>
                Remove photo
              </button>
            )}
            <button className="btn-primary" onClick={onDetect} disabled={detecting || !hasImage}>
              {detecting ? "Detecting..." : "Detect holds"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

