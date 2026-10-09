import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import type { UpdateStatus } from "./types";

/** Live updater status from the backend. */
export function useUpdate(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    api.updateStatus().then(setStatus);
    const off = listen<UpdateStatus>("update-status", (e) => setStatus(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, []);
  return status;
}
