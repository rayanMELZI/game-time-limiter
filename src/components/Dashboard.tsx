import type { Rule, Snapshot } from "../types";
import { fmtClock, fmtDuration } from "../format";
import RuleCard from "./RuleCard";
import { IconClock, IconGamepad, IconLock, IconPlus, IconRefresh } from "../icons";
import { useUpdate } from "../useUpdate";
import { api } from "../api";

interface Props {
  snap: Snapshot;
  onAdd: () => void;
  onEdit: (r: Rule) => void;
  onToggle: (r: Rule) => void;
  onDelete: (r: Rule) => void;
  onExtra: (r: Rule) => void;
}

export default function Dashboard({ snap, onAdd, onEdit, onToggle, onDelete, onExtra }: Props) {
  const resetAt = fmtClock(snap.nextReset);
  const upd = useUpdate();
  const total = snap.rules.reduce((s, r) => s + r.usedSec, 0);
  const playing = snap.rules.filter((r) => r.running && r.rule.enabled && (!r.reached || r.extra.activeLeft != null));
  const reached = snap.rules.filter((r) => r.reached).length;
  const date = new Date(snap.day + "T12:00:00").toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{date}</p>
          <h1>Today's play time</h1>
        </div>
        <button className="btn primary" onClick={onAdd}>
          <IconPlus size={18} /> Limit an app
        </button>
      </header>

      {upd?.available && (
        <div className="update-banner">
          <IconRefresh size={18} />
          <div>
            <strong>Version {upd.available} is available</strong>
            <span>
              {upd.installing
                ? "Installing — the app will restart by itself."
                : snap.settings.autoUpdate
                  ? "It installs by itself once no limited app is running."
                  : "Install it whenever you're ready."}
            </span>
          </div>
          <button className="btn primary sm" disabled={upd.installing} onClick={() => api.installUpdate().catch(() => {})}>
            {upd.installing ? "Installing…" : "Install now"}
          </button>
        </div>
      )}

      <section className="stats">
        <div className="stat">
          <IconClock />
          <div>
            <span>Played today</span>
            <strong>{fmtDuration(total)}</strong>
          </div>
        </div>
        <div className="stat">
          <IconGamepad />
          <div>
            <span>Playing now</span>
            <strong>{playing.length ? playing.map((r) => r.rule.name).join(", ") : "Nothing"}</strong>
          </div>
        </div>
        <div className="stat">
          <IconLock />
          <div>
            <span>Limits reached</span>
            <strong>
              {reached} <em>· new day at {resetAt}</em>
            </strong>
          </div>
        </div>
      </section>

      {snap.rules.length === 0 ? (
        <div className="empty card">
          <img src="/logo.svg" alt="" width={72} height={72} />
          <h2>No limits yet</h2>
          <p>
            Pick a game or app and set how long you can use it each day. You'll be warned before time runs out — then
            it gets closed and stays closed until tomorrow.
          </p>
          <button className="btn primary" onClick={onAdd}>
            <IconPlus size={18} /> Limit your first app
          </button>
        </div>
      ) : (
        <section className="grid">
          {snap.rules.map((s) => (
            <RuleCard
              key={s.rule.id}
              status={s}
              resetAt={resetAt}
              onEdit={onEdit}
              onToggle={onToggle}
              onDelete={onDelete}
              onExtra={onExtra}
            />
          ))}
        </section>
      )}
    </div>
  );
}
