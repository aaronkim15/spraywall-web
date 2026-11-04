export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "https://raspberrypi.tailf4eac6.ts.net"; // Pi backend (Tailscale Funnel); override with VITE_API_BASE_URL

// The single wall the app uses for now. Under wall versioning this becomes
// "the current active layout id." Centralized so there's one place to change.
export const WALL_ID = "a99a7ad1-834a-4770-99d3-2904f08dcca8";

// Angles (degrees) the wall can be set to. Placeholder 5-60 by 5 until measured.
// One place to edit; both the create form and the climbs filter read this.
export const WALL_ANGLES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
