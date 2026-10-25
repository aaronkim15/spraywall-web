import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Props = {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File, width: number, height: number) => void;
};

// Crop box stored as fractions (0..1) of the image, so it's resolution-independent.
type Box = { x: number; y: number; w: number; h: number };
type DragState = { mode: string; sx: number; sy: number; start: Box };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const MIN = 0.1; // smallest crop, as a fraction

export default function CropModal({ file, onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState("");
  const [aspect, setAspect] = useState(1);
  const [box, setBox] = useState<Box>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function startDrag(mode: string, e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation(); // a handle press must not also start a box-move
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...box } };
  }

  function onMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (e.clientX - drag.current.sx) / rect.width;
    const dy = (e.clientY - drag.current.sy) / rect.height;
    const s = drag.current.start;
    const mode = drag.current.mode;
    let { x, y, w, h } = s;
    if (mode === "move") {
      x = clamp(s.x + dx, 0, 1 - s.w);
      y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      if (mode.includes("w")) { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.x + s.w - nx; x = nx; }
      if (mode.includes("e")) { w = clamp(s.w + dx, MIN, 1 - s.x); }
      if (mode.includes("n")) { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN); h = s.y + s.h - ny; y = ny; }
      if (mode.includes("s")) { h = clamp(s.h + dy, MIN, 1 - s.y); }
    }
    setBox({ x, y, w, h });
  }

  function endDrag() { drag.current = null; }

  async function confirm() {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const natW = img.naturalWidth, natH = img.naturalHeight;
      const sx = Math.round(box.x * natW), sy = Math.round(box.y * natH);
      const sw = Math.max(1, Math.round(box.w * natW)), sh = Math.max(1, Math.round(box.h * natH));
      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setBusy(false); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
      if (!blob) { setBusy(false); return; }
      const base = file.name.replace(/\.[^.]+$/, "");
      const cropped = new File([blob], `${base}-crop.jpg`, { type: "image/jpeg" });
      onConfirm(cropped, sw, sh);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crop-modal">
      <div className="crop-stage" onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <div className="crop-frame" style={{ aspectRatio: String(aspect) }}>
          {url && (
            <img
              ref={imgRef}
              src={url}
              alt=""
              className="crop-img"
              draggable={false}
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)}
            />
          )}
          <div
            className="crop-box"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
            onPointerDown={(e) => startDrag("move", e)}
          >
            <span className="crop-h nw" onPointerDown={(e) => startDrag("nw", e)} />
            <span className="crop-h ne" onPointerDown={(e) => startDrag("ne", e)} />
            <span className="crop-h sw" onPointerDown={(e) => startDrag("sw", e)} />
            <span className="crop-h se" onPointerDown={(e) => startDrag("se", e)} />
          </div>
        </div>
      </div>
      <div className="crop-actions">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={confirm} disabled={busy}>{busy ? "Cropping..." : "Crop & upload"}</button>
      </div>
    </div>
  );
}
