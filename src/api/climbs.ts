import { api } from "./client";
import { API_BASE_URL } from "../config";

export type HoldRole = "start" | "hand" | "foot" | "finish";

export type ClimbSummary = {
  id: string;
  name: string;
  grade: string | null;
  description: string | null;
  send_count: number;
  created_at: string;
  sent_by_me: boolean;
  setter_name: string | null;
  rating: number | null;        // average stars, null if unrated
  rating_count: number;
  thumb_version: string | null; // md5 of the cached thumbnail; null until generated
};

// Create a climb from selected holds, each tagged with its role.
// The JWT (added by `api`) identifies the creator.
export function createClimb(payload: {
  name: string;
  grade: string | null;
  description: string | null;
  feetRules: string | null;
  wallId: string;
  holds: { id: string; role: HoldRole }[];
}) {
  return api<{ id: string }>("/climbs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listClimbs() {
  return api<ClimbSummary[]>("/climbs");
}

export function thumbUrl(climbId: string, version: string) {
  return `${API_BASE_URL}/climbs/${climbId}/thumb?v=${version}`;
}

export type ClimbHold = {
  id: string;
  x_pos: number;
  y_pos: number;
  points: { x: number; y: number }[] | null;
  role: HoldRole;
};

export type SendEntry = {
  id: string;
  user_id: string;
  attempts: number;
  display_name: string | null;
  has_avatar: boolean;
  avatar_version: string | null;
  created_at: string;
};

export type ClimbDetail = {
  id: string;
  name: string;
  grade: string | null;
  description: string | null;
  feet_rules: string | null;
  created_at: string;
  creator_id: string | null;
  setter_name: string | null;
  rating: number | null;        // average stars
  rating_count: number;
  my_rating: number | null;     // the current user's stars (null if not logged in / unrated)
  holds: ClimbHold[];
  sends: SendEntry[];
  send_count: number;
};

export function getClimb(id: string) {
  return api<ClimbDetail>(`/climbs/${id}`);
}

export function deleteClimb(id: string) {
  return api<void>(`/climbs/${id}`, { method: "DELETE" });
}

// Log a new ascent. attempts is captured now and never edited afterward.
export function sendClimb(id: string, attempts: number) {
  return api<SendEntry>(`/climbs/${id}/send`, {
    method: "POST",
    body: JSON.stringify({ attempts }),
  });
}

// Remove one of your own ascents.
export function deleteSend(sendId: string) {
  return api<void>(`/climbs/sends/${sendId}`, { method: "DELETE" });
}

export function updateClimb(
  id: string,
  payload: {
    name: string;
    grade: string | null;
    description: string | null;
    feetRules: string | null;
    holds: { id: string; role: HoldRole }[];
  }
) {
  return api<{ id: string }>(`/climbs/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
