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
  enabled: boolean;
}

export interface RuleStatus {
  rule: Rule;
  usedSec: number;
  limitSec: number;
  running: boolean;
  processes: string[];
  reached: boolean;
  locked: boolean;
}

export interface Settings {
  resetHour: number;
  sound: boolean;
  overlay: boolean;
  notifications: boolean;
  guardQuit: boolean;
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
}
