import { useState } from "react";
import type { Rule, RuleStatus } from "../types";
import { basename, fmtCountdown, fmtDuration, fmtMinutes } from "../format";
import Ring from "./Ring";
import AppAvatar from "./AppAvatar";
import { IconClock, IconEdit, IconFile, IconFolder, IconLock, IconPause, IconPlay, IconTrash } from "../icons";

interface Props {
  status: RuleStatus;
  resetAt: string;
  onEdit: (r: Rule) => void;
  onToggle: (r: Rule) => void;
  onDelete: (r: Rule) => void;
  onExtra: (r: Rule) => void;
}

export default function RuleCard({ status, resetAt, onEdit, onToggle, onDelete, onExtra }: Props) {
  const { rule, usedSec, limitSec, running, locked, lockedEarly, reached, extra } = status;
  const inExtra = extra.activeLeft != null;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remaining = Math.max(0, limitSec - usedSec);
  const progress = limitSec > 0 ? usedSec / limitSec : 1;

  const tone = !rule.enabled
    ? "off"
    : inExtra
      ? "warn"
      : reached
      ? "danger"
      : remaining <= Math.min(600, limitSec * 0.2)
        ? "warn"
        : "ok";
  const pill = !rule.enabled
    ? { cls: "off", text: "Paused" }
    : inExtra
      ? { cls: "extra", text: running ? "Extra time · playing" : "Extra time" }
      : reached
      ? { cls: "danger", text: limitSec === 0 ? "Blocked" : "Limit reached" }
      : running
        ? { cls: "live", text: "Playing now" }
        : { cls: "idle", text: "Not running" };
  const isLive = running && rule.enabled && (!reached || inExtra);

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
        <Ring
          progress={!rule.enabled ? 0 : inExtra ? (extra.activeLeft ?? 0) / ((extraLength(extra.used) || 1) * 60) : progress}
          tone={tone}
        >
          {inExtra ? (
            <>
              <strong>{fmtCountdown(extra.activeLeft ?? 0)}</strong>
              <small>extra time</small>
            </>
          ) : locked && reached ? (
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
        {rule.lockEarly ? (
          <span className="chip strict" title="Can't be changed from the first warning until the next day">
            <IconLock size={12} /> Super strict
          </span>
        ) : rule.lockWhenReached && (
          <span className="chip strict" title="Can't be changed once the limit is reached">
            <IconLock size={12} /> Strict
          </span>
        )}
      </div>

      {reached && rule.enabled && rule.allowExtra && <ExtraRow extra={extra} onStart={() => onExtra(rule)} />}

      <footer className="rule-actions">
        {locked ? (
          <p className="locked-note">
            <IconLock size={14} /> {lockedEarly ? "Super strict — locked since the first warning, unlocks" : "Locked — editing unlocks"} at {resetAt}
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

const EXTRA_STEPS = [5, 2, 1];
const extraLength = (used: number) => EXTRA_STEPS[Math.max(0, Math.min(used, EXTRA_STEPS.length) - 1)];

/** Extra time after the limit: available, running, cooling down or used up. */
function ExtraRow({ extra, onStart }: { extra: RuleStatus["extra"]; onStart: () => void }) {
  const steps = (
    <span className="extra-steps" title="Extra sessions used today">
      {EXTRA_STEPS.map((m, i) => (
        <i key={m} className={i < extra.used ? "used" : ""}>{m}m</i>
      ))}
    </span>
  );
  if (extra.activeLeft != null) {
    return (
      <div className="extra-row active">
        <IconClock size={15} />
        <span>Extra time running — <b>{fmtCountdown(extra.activeLeft)}</b> left</span>
        {steps}
      </div>
    );
  }
  if (extra.nextMinutes == null) {
    return (
      <div className="extra-row done">
        <IconLock size={15} />
        <span>No extra time left today</span>
        {steps}
      </div>
    );
  }
  if (extra.cooldownLeft != null) {
    return (
      <div className="extra-row">
        <IconClock size={15} />
        <span>
          {extra.nextMinutes} more min available in <b>{fmtCountdown(extra.cooldownLeft)}</b>
        </span>
        {steps}
      </div>
    );
  }
  return (
    <div className="extra-row ready">
      <span>Need to finish something?</span>
      <button className="btn primary sm" onClick={onStart}>
        Use {extra.nextMinutes} more minute{extra.nextMinutes === 1 ? "" : "s"}
      </button>
    </div>
  );
}
