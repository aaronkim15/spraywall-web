import type { HoldRole } from "../api/climbs";

// One source of truth for how roles look, shared by the create and view screens.
export const ROLE_COLORS: Record<HoldRole, string> = {
  start: "#ef4444",
  hand: "#ffffff",
  foot: "#22c55e",
  finish: "#ef4444",
};

// Text written on the hold for roles that need a marker (hybrid gets none).
export const ROLE_ONHOLD: Partial<Record<HoldRole, string>> = {
  start: "START",
  finish: "FINISH",
  foot: "FOOT",
};

export const ROLE_LABELS: Record<HoldRole, string> = {
  hand: "Hybrid",
  start: "Start",
  foot: "Foot",
  finish: "Finish",
};
