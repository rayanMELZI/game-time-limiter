import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../api";
import type { Toast } from "../types";
import { IconAlert, IconClock, IconLock } from "../icons";

const VISIBLE_MS = 9000;

/** Content of the small always-on-top warning window. */
export default function ToastView() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    api.toast().then((t) => {
      setToast(t);
      setStamp(Date.now());
    });
    const off = listen<Toast>("toast", (e) => {
      setToast(e.payload);
      setStamp(Date.now());
    });
    return () => {
      off.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!stamp) return;
    const t = setTimeout(() => getCurrentWindow().close(), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [stamp]);

  if (!toast) return null;
  const Icon = toast.level === "danger" ? IconLock : toast.level === "warning" ? IconAlert : IconClock;

  return (
    <div className={`toast ${toast.level}`} key={stamp} onClick={() => getCurrentWindow().close()}>
      <div className="toast-icon">
        <Icon size={22} />
      </div>
      <div className="toast-text">
        <strong>{toast.title}</strong>
        <p>{toast.body}</p>
      </div>
      <div className="toast-timer" style={{ animationDuration: `${VISIBLE_MS}ms` }} />
    </div>
  );
}
