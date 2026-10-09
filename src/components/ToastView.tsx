import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, errorText } from "../api";
import type { Toast } from "../types";
import { IconAlert, IconClock, IconLock } from "../icons";

const VISIBLE_MS = 9000;
/** Leave more time to react when the banner offers extra time. */
const VISIBLE_ACTION_MS = 20000;

/** Content of the small always-on-top warning window. */
export default function ToastView() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [stamp, setStamp] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const show = (t: Toast | null) => {
      setToast(t);
      setError(null);
      setStamp(Date.now());
    };
    api.toast().then(show);
    const off = listen<Toast>("toast", (e) => show(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, []);

  const duration = toast?.action ? VISIBLE_ACTION_MS : VISIBLE_MS;

  useEffect(() => {
    if (!stamp) return;
    const t = setTimeout(() => getCurrentWindow().close(), duration);
    return () => clearTimeout(t);
  }, [stamp, duration]);

  if (!toast) return null;
  const Icon = toast.level === "danger" ? IconLock : toast.level === "warning" ? IconAlert : IconClock;

  const startExtra = async (ruleId: string) => {
    try {
      await api.startExtra(ruleId);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className={`toast ${toast.level} ${toast.action ? "has-action" : ""}`} key={stamp} onClick={() => getCurrentWindow().close()}>
      <div className="toast-main">
        <div className="toast-icon">
          <Icon size={22} />
        </div>
        <div className="toast-text">
          <strong>{toast.title}</strong>
          <p>{error ?? toast.body}</p>
        </div>
      </div>
      {toast.action && (
        <div className="toast-actions">
          <button
            className="btn primary sm"
            onClick={(e) => {
              e.stopPropagation();
              startExtra(toast.action!.ruleId);
            }}
          >
            {toast.action.label}
          </button>
          <button className="btn ghost sm">Dismiss</button>
        </div>
      )}
      <div className="toast-timer" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
