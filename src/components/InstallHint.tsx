import { useEffect, useState } from "react";

const DISMISS_KEY = "spraywall_install_hint_dismissed";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

// iOS Safari hides any install button, so nudge the user to the Share menu once.
export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    if (isIos() && !isStandalone() && !dismissed) setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  return (
    <div className="install-hint">
      <span>
        Install SprayWall: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </span>
      <button onClick={dismiss} aria-label="Dismiss">&times;</button>
    </div>
  );
}
