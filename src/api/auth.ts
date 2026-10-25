import { api } from "./client";
import { API_BASE_URL } from "../config";
import type { User } from "../auth/AuthContext";

export function changeEmail(email: string) {
  return api<{ user: User }>("/auth/email", {
    method: "PATCH",
    body: JSON.stringify({ email }),
  }).then((r) => r.user);
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api<{ ok: boolean }>("/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("image", file);
  return api<{ ok: boolean; avatar_version: string }>("/auth/avatar", {
    method: "POST",
    body: form,
  });
}

export function avatarUrl(userId: string, version: string) {
  return `${API_BASE_URL}/users/${userId}/avatar?v=${version}`;
}
