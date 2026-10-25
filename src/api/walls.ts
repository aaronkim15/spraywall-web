import { api } from "./client";
import { API_BASE_URL } from "../config";

export type Point = { x: number; y: number };
export type Hold = {
  id: string;
  x_pos: number;
  y_pos: number;
  points: Point[] | null;
  source: string;
};
export type Wall = {
  id: string;
  name: string;
  image_width: number | null;
  image_height: number | null;
  has_image: boolean;
  image_version: string | null; // md5 of the photo; changes when the photo changes
};

// Kept in memory for the life of the tab so navigating between screens is instant.
const wallCache: Record<string, Wall> = {};
const holdsCache: Record<string, Hold[]> = {};
export function cachedWall(id: string): Wall | null { return wallCache[id] ?? null; }
export function cachedHolds(id: string): Hold[] | null { return holdsCache[id] ?? null; }

export function getWall(id: string) {
  return api<{ wall: Wall }>(`/walls/${id}`).then((r) => { wallCache[id] = r.wall; return r.wall; });
}

export function getHolds(id: string) {
  return api<{ holds: Hold[] }>(`/walls/${id}/holds`).then((r) => { holdsCache[id] = r.holds; return r.holds; });
}

// Warm the wall, its holds, and the photo before the user opens a wall screen.
export async function prefetchWall(id: string): Promise<Wall> {
  const [w] = await Promise.all([getWall(id), getHolds(id).catch(() => [])]);
  if (w.has_image) {
    const img = new Image();
    img.src = wallImageUrl(id, w.image_version ?? "0"); // pulls the photo into the browser cache
  }
  return w;
}

export function addHold(id: string, body: { x_pos: number; y_pos: number; points: Point[] }) {
  return api<{ hold: Hold }>(`/walls/${id}/holds`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.hold);
}

export function removeHold(holdId: string) {
  return api(`/holds/${holdId}`, { method: "DELETE" });
}

export function detectHolds(id: string) {
  return api<{ inserted: number }>(`/walls/${id}/detect`, { method: "POST" });
}

export function removePhoto(id: string) {
  return api(`/walls/${id}/image`, { method: "DELETE" });
}

export function uploadPhoto(id: string, file: File, width: number, height: number) {
  const form = new FormData();
  form.append("image", file);
  form.append("width", String(width));
  form.append("height", String(height));
  return api<{ ok: boolean }>(`/walls/${id}/image`, { method: "POST", body: form });
}

export function refineOutlines(id: string, outlines: Point[][]) {
  return api<{ outlines: Point[][]; refined: boolean }>(`/walls/${id}/refine`, {
    method: "POST",
    body: JSON.stringify({ outlines }),
  });
}

export function wallImageUrl(id: string, version: string | number) {
  return `${API_BASE_URL}/walls/${id}/image?v=${version}`;
}
