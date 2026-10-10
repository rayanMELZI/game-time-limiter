export type TargetKind = "exe" | "folder";

export interface Target {
  kind: TargetKind;
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  targets: Target[];
  dailyLimitMin: number;
  weekendLimitMin: number | null;
  warningsMin: number[];
  lockWhenReached: boolean;
  /** Super strict: locked from the first warning. */
  lockEarly: boolean;
  enabled: boolean;
  allowExtra: boolean;
}

export interface ExtraInfo {
  /** Seconds left in the running extra session. */
  activeLeft: number | null;
  /** Seconds until the next extra session can start. */
  cooldownLeft: number | null;
  /** Length of the next extra session, if any is left. */
  nextMinutes: number | null;
  used: number;
}

export interface RuleStatus {
  rule: Rule;
  usedSec: number;
  limitSec: number;
  running: boolean;
  processes: string[];
  reached: boolean;
  locked: boolean;
  lockedEarly: boolean;
  extra: ExtraInfo;
}

export interface Settings {
  resetHour: number;
  sound: boolean;
  overlay: boolean;
  notifications: boolean;
  guardQuit: boolean;
  soundFile: string | null;
  soundName: string | null;
  autoUpdate: boolean;
}

export interface UpdateStatus {
  current: string;
  available: string | null;
  checking: boolean;
  installing: boolean;
  error: string | null;
  checkedAt: number | null;
}

export interface Snapshot {
  day: string;
  nextReset: string;
  rules: RuleStatus[];
  settings: Settings;
  canQuit: boolean;
}

export interface ProcInfo {
  name: string;
  path: string | null;
  memory: number;
}

export interface DayUsage {
  day: string;
  weekday: number;
  usage: Record<string, number>;
}

export interface Toast {
  level: "info" | "warning" | "danger";
  title: string;
  body: string;
  action: { label: string; ruleId: string } | null;
}
