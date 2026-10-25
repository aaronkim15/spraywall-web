import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { changeEmail, changePassword, uploadAvatar, avatarUrl } from "../api/auth";

export default function Profile() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();

  const [email, setEmail] = useState(user?.email ?? "");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const initial = (user?.email?.[0] ?? "?").toUpperCase();

  async function onEmailSave() {
    setEmailMsg(null);
    if (!email.includes("@")) { setEmailMsg("Enter a valid email."); return; }
    setSavingEmail(true);
    try {
      await changeEmail(email.trim());
      await refreshUser();
      setEmailMsg("Email updated.");
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : "Could not update email.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function onPasswordSave() {
    setPwMsg(null);
    if (newPassword.length < 8) { setPwMsg("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwMsg("New passwords do not match."); return; }
    setSavingPw(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPwMsg("Password updated.");
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : "Could not update password.");
    } finally {
      setSavingPw(false);
    }
  }

  async function onAvatarChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setAvatarMsg(null);
    try {
      await uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      setAvatarMsg(err instanceof Error ? err.message : "Could not upload photo.");
    }
  }

  function onSignOut() {
    logout();
    navigate("/login");
  }

  return (
    <div className="builder-screen">
      <div className="wall-topbar">
        <button className="link-btn" onClick={() => navigate("/home")}>&larr; Home</button>
      </div>

      <div className="details-form">
        <div className="avatar-block">
          <div className="avatar-circle" onClick={() => fileRef.current?.click()}>
            {user?.has_avatar ? (
              <img src={avatarUrl(user.id, user.avatar_version ?? "0")} alt="avatar" />
            ) : (
              <span className="avatar-initial">{initial}</span>
            )}
          </div>
          <button className="link-btn" onClick={() => fileRef.current?.click()}>Change photo</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarChosen} />
          {avatarMsg && <div className="wall-error">{avatarMsg}</div>}
        </div>

        <section className="profile-section">
          <h3 className="profile-heading">Email</h3>
          <label className="field">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn-primary" onClick={onEmailSave} disabled={savingEmail}>
            {savingEmail ? "Saving..." : "Update email"}
          </button>
          {emailMsg && <div className="form-msg">{emailMsg}</div>}
        </section>

        <section className="profile-section">
          <h3 className="profile-heading">Password</h3>
          <label className="field">
            <span className="field-label">Current password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Confirm new password</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
          <button className="btn-primary" onClick={onPasswordSave} disabled={savingPw}>
            {savingPw ? "Saving..." : "Update password"}
          </button>
          {pwMsg && <div className="form-msg">{pwMsg}</div>}
        </section>

        <button className="btn-danger" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}
