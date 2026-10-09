import { useEffect, useState } from "react";
import { api } from "../api";
import type { DayUsage, Snapshot } from "../types";
import { fmtDuration } from "../format";
import AppAvatar from "./AppAvatar";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RANGES = [7, 14, 30];

export default function History({ snap }: { snap: Snapshot }) {
  const [days, setDays] = useState(7);
  const [history, setHistory] = useState<DayUsage[]>([]);

  // Refresh when the range changes or today's usage moves on.
  const todayTotal = Math.floor(snap.rules.reduce((s, r) => s + r.usedSec, 0) / 30);
  useEffect(() => {
    api.history(days).then(setHistory);
  }, [days, todayTotal, snap.day]);

  const totals = history.map((d) => Object.values(d.usage).reduce((a, b) => a + b, 0));
  const max = Math.max(3600, ...totals);
  const sum = totals.reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Last {days} days</p>
          <h1>History</h1>
        </div>
        <div className="segmented">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? "on" : ""} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </div>
      </header>

      <section className="card chart-card">
        <div className="chart-summary">
          <div>
            <span>Total</span>
            <strong>{fmtDuration(sum)}</strong>
          </div>
          <div>
            <span>Daily average</span>
            <strong>{fmtDuration(history.length ? sum / history.length : 0)}</strong>
          </div>
        </div>
        <div className="bars" style={{ gridTemplateColumns: `repeat(${history.length || 1}, 1fr)` }}>
          {history.map((d, i) => (
            <div className="bar-col" key={d.day} title={`${d.day}: ${fmtDuration(totals[i])}`}>
              <div className="bar-track">
                <div className="bar" style={{ height: `${(totals[i] / max) * 100}%` }} />
              </div>
              <span className={d.day === snap.day ? "today" : ""}>
                {days <= 14 ? DAY_NAMES[d.weekday] : d.day.slice(8)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Per app</h3>
        {snap.rules.length === 0 && <p className="muted">No apps limited yet.</p>}
        <div className="per-app">
          {snap.rules.map((r) => {
            const perDay = history.map((d) => d.usage[r.rule.id] ?? 0);
            const total = perDay.reduce((a, b) => a + b, 0);
            const overDays = perDay.filter((s) => s >= r.limitSec && r.limitSec > 0).length;
            const peak = Math.max(r.limitSec, ...perDay, 1);
            return (
              <div className="per-app-row" key={r.rule.id}>
                <AppAvatar name={r.rule.name} size={32} />
                <div className="per-app-name">
                  <strong>{r.rule.name}</strong>
                  <span>
                    {fmtDuration(total)} · limit hit {overDays}×
                  </span>
                </div>
                <div className="spark">
                  {perDay.map((s, i) => (
                    <i
                      key={i}
                      className={s >= r.limitSec && r.limitSec > 0 ? "full" : ""}
                      style={{ height: `${Math.max(4, (s / peak) * 100)}%`, opacity: s ? 1 : 0.25 }}
                      title={`${history[i]?.day}: ${fmtDuration(s)}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
