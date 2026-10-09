import { invoke } from "@tauri-apps/api/core";
import type { DayUsage, ProcInfo, Rule, Settings, Snapshot, Toast, UpdateStatus } from "./types";

export const api = {
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  saveRule: (rule: Rule) => invoke<Snapshot>("save_rule", { rule }),
  deleteRule: (id: string) => invoke<Snapshot>("delete_rule", { id }),
  setRuleEnabled: (id: string, enabled: boolean) => invoke<Snapshot>("set_rule_enabled", { id, enabled }),
  saveSettings: (settings: Settings) => invoke<Snapshot>("save_settings", { settings }),
  processes: () => invoke<ProcInfo[]>("list_processes"),
  history: (days: number) => invoke<DayUsage[]>("get_history", { days }),
  toast: () => invoke<Toast | null>("get_toast"),
  testAlert: () => invoke<void>("test_alert"),
  getAutostart: () => invoke<boolean>("get_autostart"),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  quit: () => invoke<void>("quit_app"),
  startExtra: (id: string) => invoke<Snapshot>("start_extra", { id }),
  setSound: (path: string | null) => invoke<Snapshot>("set_sound", { path }),
  testSound: () => invoke<void>("test_sound"),
  updateStatus: () => invoke<UpdateStatus>("get_update_status"),
  checkUpdate: () => invoke<UpdateStatus>("check_update"),
  installUpdate: () => invoke<void>("install_update"),
};

export function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}
