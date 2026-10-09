const pad = (n: number) => String(n).padStart(2, "0");

/** "1h 05m", "12m 30s", "45s" */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

/** "4:05" countdown */
export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Compact form for limits: "2h", "1h 30m", "45m" */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "Kenshi_x64.exe" -> "Kenshi" */
export function prettyName(exe: string): string {
  const base = exe.replace(/\.exe$/i, "").replace(/[_-](x64|x86|win64|win32|gog|steam|dx11|dx12)\b/gi, "");
  const words = base.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function basename(path: string): string {
  return path.split(/[\/]/).filter(Boolean).pop() ?? path;
}

const HUES = [252, 172, 28, 340, 205, 130, 290, 48];
export function hueFor(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
