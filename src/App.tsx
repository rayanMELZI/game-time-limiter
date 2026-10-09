import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, errorText } from "./api";
import type { Rule, Snapshot } from "./types";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import SettingsPage from "./components/SettingsPage";
import RuleEditor from "./components/RuleEditor";
import { IconAlert, IconChart, IconHome, IconPower, IconSettings } from "./icons";

type Page = "dashboard" | "history" | "settings";

export type Run = (action: () => Promise<Snapshot | void>, success?: string) => Promise<boolean>;

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    api.snapshot().then(setSnap);
    const off = listen<Snapshot>("snapshot", (e) => setSnap(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  /** Runs a backend action, applies the returned snapshot and surfaces errors. */
  const run: Run = useCallback(async (action, success) => {
    try {
      const next = await action();
      if (next) setSnap(next);
      if (success) setNotice({ text: success, error: false });
      return true;
    } catch (e) {
      setNotice({ text: errorText(e), error: true });
      return false;
    }
  }, []);

  if (!snap) return <div className="boot" />;

  const playing = snap.rules.filter((r) => r.running && r.rule.enabled).length;
  const nav: { id: Page; label: string; icon: JSX.Element }[] = [
    { id: "dashboard", label: "Today", icon: <IconHome /> },
    { id: "history", label: "History", icon: <IconChart /> },
    { id: "settings", label: "Settings", icon: <IconSettings /> },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.svg" alt="" width={34} height={34} />
          <div>
            <strong>Game Time</strong>
            <span>Limiter</span>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={`live ${playing ? "on" : ""}`}>
            <span className="dot" />
            {playing ? `Tracking ${playing} app${playing > 1 ? "s" : ""}` : "Watching for apps"}
          </div>
          <button
            className="nav-item subtle"
            title={snap.canQuit ? "Stop the limiter" : "Quit protection is on"}
            onClick={() => run(() => api.quit())}
          >
            <IconPower /> Quit
          </button>
        </div>
      </aside>

      <main className="content">
        {page === "dashboard" && (
          <Dashboard
            snap={snap}
            onAdd={() => setEditing("new")}
            onEdit={(r) => setEditing(r)}
            onToggle={(r) =>
              run(() => api.setRuleEnabled(r.id, !r.enabled), r.enabled ? `${r.name} paused` : `${r.name} resumed`)
            }
            onDelete={(r) => run(() => api.deleteRule(r.id), `${r.name} removed`)}
            onExtra={(r) => run(() => api.startExtra(r.id), `Extra time started for ${r.name}`)}
          />
        )}
        {page === "history" && <History snap={snap} />}
        {page === "settings" && <SettingsPage snap={snap} run={run} />}
      </main>

      {editing && (
        <RuleEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (rule) => {
            const ok = await run(
              () => api.saveRule(rule),
              editing === "new" ? `${rule.name} is now limited` : "Changes saved",
            );
            if (ok) setEditing(null);
          }}
        />
      )}

      {notice && (
        <div className={`snackbar ${notice.error ? "error" : ""}`} role="status">
          {notice.error && <IconAlert size={16} />}
          {notice.text}
        </div>
      )}
    </div>
  );
}
