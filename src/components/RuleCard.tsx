import { useState } from "react";
import type { Rule, RuleStatus } from "../types";
import { basename, fmtDuration, fmtMinutes } from "../format";
import Ring from "./Ring";
import AppAvatar from "./AppAvatar";
import { IconEdit, IconFile, IconFolder, IconLock, IconPause, IconPlay, IconTrash } from "../icons";

interface Props {
  status: RuleStatus;
  resetAt: string;
  onEdit: (r: Rule) => void;
  onToggle: (r: Rule) => void;
  onDelete: (r: Rule) => void;
}

export default function RuleCard({ status, resetAt, onEdit, onToggle, onDelete }: Props) {
  const { rule, usedSec, limitSec, running, locked, reached } = status;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remaining = Math.max(0, limitSec - usedSec);
  const progress = limitSec > 0 ? usedSec / limitSec : 1;

  const tone = !rule.enabled
    ? "off"
    : reached
      ? "danger"
      : remaining <= Math.min(600, limitSec * 0.2)
        ? "warn"
        : "ok";
  const pill = !rule.enabled
    ? { cls: "off", text: "Paused" }
    : reached
      ? { cls: "danger", text: limitSec === 0 ? "Blocked" : "Limit reached" }
      : running
        ? { cls: "live", text: "Playing now" }
        : { cls: "idle", text: "Not running" };
  const isLive = running && rule.enabled && !reached;

  return (
    <article className={`card rule-card ${isLive ? "is-running" : ""} ${!rule.enabled ? "is-off" : ""}`}>
      <header className="rule-head">
        <AppAvatar name={rule.name} />
        <div className="rule-title">
          <h3 title={rule.name}>{rule.name}</h3>
          <span className={`pill ${pill.cls}`}>
            {pill.cls === "live" && <span className="dot" />}
            {pill.text}
          </span>
        </div>
      </header>

      <div className="rule-body">
        <Ring progress={rule.enabled ? progress : 0} tone={tone}>
          {locked ? (
            <>
              <IconLock size={22} />
              <small>until {resetAt}</small>
            </>
          ) : (
            <>
              <strong>{reached ? "0m" : fmtDuration(remaining)}</strong>
              <small>left today</small>
            </>
          )}
        </Ring>
        <dl className="rule-stats">
          <div>
            <dt>Played</dt>
            <dd>{fmtDuration(usedSec)}</dd>
          </div>
          <div>
            <dt>Today's limit</dt>
            <dd>{fmtMinutes(Math.round(limitSec / 60))}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{rule.warningsMin.length ? rule.warningsMin.map((w) => `${w}m`).join(" · ") : "None"}</dd>
          </div>
        </dl>
      </div>

      <div className="chips">
        {rule.targets.map((t) => (
          <span className="chip mono" key={t.kind + t.value} title={t.value}>
            {t.kind === "exe" ? <IconFile size={12} /> : <IconFolder size={12} />}
            {t.kind === "exe" ? t.value : basename(t.value)}
          </span>
        ))}
        {rule.weekendLimitMin != null && <span className="chip">Weekend {fmtMinutes(rule.weekendLimitMin)}</span>}
        {rule.lockWhenReached && (
          <span className="chip strict" title="Can't be changed once the limit is reached">
            <IconLock size={12} /> Strict
          </span>
        )}
      </div>

      <footer className="rule-actions">
        {locked ? (
          <p className="locked-note">
            <IconLock size={14} /> Locked — editing unlocks at {resetAt}
          </p>
        ) : confirmDelete ? (
          <>
            <span className="confirm-text">Remove this limit?</span>
            <button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="btn danger sm" onClick={() => onDelete(rule)}>
              Remove
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost sm" onClick={() => onEdit(rule)}>
              <IconEdit size={15} /> Edit
            </button>
            <button className="btn ghost sm" onClick={() => onToggle(rule)}>
              {rule.enabled ? <IconPause size={15} /> : <IconPlay size={15} />}
              {rule.enabled ? "Pause" : "Resume"}
            </button>
            <button className="btn ghost sm icon-only" title="Remove" onClick={() => setConfirmDelete(true)}>
              <IconTrash size={15} />
            </button>
          </>
        )}
      </footer>
    </article>
  );
}
