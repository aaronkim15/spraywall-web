export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "https://spraywall-backend.onrender.com";

// The single wall the app uses for now. Under wall versioning this becomes
// "the current active layout id." Centralized so there's one place to change.
export const WALL_ID = "a99a7ad1-834a-4770-99d3-2904f08dcca8";
