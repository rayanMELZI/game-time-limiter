import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import type { ProcInfo, Rule, Target } from "../types";
import { basename, fmtMinutes, prettyName } from "../format";
import AppAvatar from "./AppAvatar";
import { IconCheck, IconFile, IconFolder, IconLock, IconRefresh, IconSearch, IconX } from "../icons";

const LIMIT_PRESETS = [30, 60, 90, 120, 180, 240];
const WARNING_OPTIONS = [30, 15, 10, 5, 2, 1];

interface Props {
  initial: Rule | null;
  onClose: () => void;
  onSave: (rule: Rule) => void;
}

function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0));
  return (
    <div className="duration">
      <label>
        <input type="number" min={0} max={24} value={h}
          onChange={(e) => onChange(clamp(+e.target.value, 24) * 60 + m)} />
        <span>h</span>
      </label>
      <label>
        <input type="number" min={0} max={59} step={5} value={m}
          onChange={(e) => onChange(h * 60 + clamp(+e.target.value, 59))} />
        <span>min</span>
      </label>
    </div>
  );
}

export default function RuleEditor({ initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [nameTouched, setNameTouched] = useState(!!initial);
  const [targets, setTargets] = useState<Target[]>(initial?.targets ?? []);
  const [limit, setLimit] = useState(initial?.dailyLimitMin ?? 60);
  const [weekend, setWeekend] = useState<number | null>(initial?.weekendLimitMin ?? null);
  const [warnings, setWarnings] = useState<number[]>(initial?.warningsMin ?? [10, 5, 1]);
  const [strict, setStrict] = useState(initial?.lockWhenReached ?? true);

  const [procs, setProcs] = useState<ProcInfo[] | null>(null);
  const [query, setQuery] = useState("");

  const loadProcs = () => {
    setProcs(null);
    api.processes().then(setProcs);
  };
  useEffect(loadProcs, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (procs ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.path?.toLowerCase().includes(q));
  }, [procs, query]);

  const hasTarget = (t: Target) => targets.some((x) => x.kind === t.kind && x.value.toLowerCase() === t.value.toLowerCase());

  const addTarget = (t: Target) => {
    if (hasTarget(t)) return;
    setTargets((prev) => [...prev, t]);
    if (!nameTouched && !name) setName(t.kind === "exe" ? prettyName(t.value) : basename(t.value));
  };

  const toggleProc = (p: ProcInfo) => {
    const t: Target = { kind: "exe", value: p.name };
    if (hasTarget(t)) setTargets((prev) => prev.filter((x) => !(x.kind === "exe" && x.value.toLowerCase() === p.name.toLowerCase())));
    else addTarget(t);
  };

  const browseExe = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Programs", extensions: ["exe"] }] });
    if (typeof path === "string") addTarget({ kind: "exe", value: basename(path) });
  };

  const browseFolder = async () => {
    const path = await open({ directory: true, multiple: false });
    if (typeof path === "string") addTarget({ kind: "folder", value: path });
  };

  const toggleWarning = (w: number) =>
    setWarnings((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]).sort((a, b) => b - a));

  const save = () =>
    onSave({
      id: initial?.id ?? "",
      name: name.trim(),
      targets,
      dailyLimitMin: limit,
      weekendLimitMin: weekend,
      warningsMin: warnings.filter((w) => w < Math.max(limit, weekend ?? 0)),
      lockWhenReached: strict,
      enabled: initial?.enabled ?? true,
    });

  const canSave = name.trim() && targets.length > 0;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-labelledby="editor-title">
        <header className="modal-head">
          <h2 id="editor-title">{initial ? `Edit ${initial.name}` : "Limit an app"}</h2>
          <button className="btn ghost icon-only" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>

        <div className="modal-body">
          <section className="picker">
            <div className="section-label">
              <span>1. What should be limited?</span>
              <button className="btn ghost sm" onClick={loadProcs} title="Refresh list">
                <IconRefresh size={14} />
              </button>
            </div>
            <div className="search">
              <IconSearch size={16} />
              <input placeholder="Search running apps…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="proc-list">
              {procs === null ? (
                <p className="muted center">Scanning running apps…</p>
              ) : filtered.length === 0 ? (
                <p className="muted center">No running app matches. Launch the game, or browse for its .exe below.</p>
              ) : (
                filtered.map((p) => {
                  const selected = hasTarget({ kind: "exe", value: p.name });
                  return (
                    <button key={p.name} className={`proc ${selected ? "selected" : ""}`} onClick={() => toggleProc(p)}>
                      <AppAvatar name={prettyName(p.name)} size={30} />
                      <div className="proc-text">
                        <strong>{p.name}</strong>
                        <span title={p.path ?? ""}>{p.path}</span>
                      </div>
                      <span className="proc-mem">{Math.round(p.memory / 1048576)} MB</span>
                      <span className="check">{selected && <IconCheck size={14} />}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="browse-row">
              <button className="btn ghost sm" onClick={browseExe}>
                <IconFile size={15} /> Browse for .exe
              </button>
              <button className="btn ghost sm" onClick={browseFolder} title="Limits every program inside this folder">
                <IconFolder size={15} /> Whole game folder
              </button>
            </div>
          </section>

          <section className="form">
            <div className="section-label">
              <span>2. Rules</span>
            </div>

            <label className="field">
              <span>Name</span>
              <input value={name} placeholder="e.g. Kenshi" onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
            </label>

            <div className="field">
              <span>Limited programs</span>
              <div className="chips">
                {targets.length === 0 && <span className="muted small">Pick from the list on the left.</span>}
                {targets.map((t) => (
                  <span className="chip mono removable" key={t.kind + t.value} title={t.value}>
                    {t.kind === "exe" ? <IconFile size={12} /> : <IconFolder size={12} />}
                    {t.kind === "exe" ? t.value : t.value}
                    <button onClick={() => setTargets((prev) => prev.filter((x) => x !== t))} aria-label="Remove">
                      <IconX size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Daily limit</span>
              <div className="row">
                <DurationInput minutes={limit} onChange={setLimit} />
                <div className="presets">
                  {LIMIT_PRESETS.map((p) => (
                    <button key={p} className={`preset ${limit === p ? "on" : ""}`} onClick={() => setLimit(p)}>
                      {fmtMinutes(p)}
                    </button>
                  ))}
                </div>
              </div>
              {limit === 0 && <small className="hint warn">0 minutes blocks this app completely.</small>}
            </div>

            <div className="field">
              <label className="toggle-row">
                <input type="checkbox" checked={weekend !== null} onChange={(e) => setWeekend(e.target.checked ? limit : null)} />
                <span className="switch" />
                <span>Different limit on Saturday &amp; Sunday</span>
              </label>
              {weekend !== null && <DurationInput minutes={weekend} onChange={setWeekend} />}
            </div>

            <div className="field">
              <span>Warn me before closing</span>
              <div className="presets">
                {WARNING_OPTIONS.map((w) => (
                  <button key={w} className={`preset ${warnings.includes(w) ? "on" : ""}`} onClick={() => toggleWarning(w)}>
                    {w} min
                  </button>
                ))}
              </div>
            </div>

            <label className={`strict-box ${strict ? "on" : ""}`}>
              <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              <span className="switch" />
              <div>
                <strong><IconLock size={14} /> Strict mode</strong>
                <p>
                  Once the limit is reached, this rule can't be edited, paused or removed until the next day. Turn it off
                  if you want to be able to extend your time.
                </p>
              </div>
            </label>
          </section>
        </div>

        <footer className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!canSave} onClick={save}>
            {initial ? "Save changes" : "Start limiting"}
          </button>
        </footer>
      </div>
    </div>
  );
}
