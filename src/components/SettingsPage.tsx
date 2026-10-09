import { useEffect, useState } from "react";
import { api } from "../api";
import type { Run } from "../App";
import type { Settings, Snapshot } from "../types";
import { open } from "@tauri-apps/plugin-dialog";
import { IconBell, IconClock, IconPlay, IconShield } from "../icons";

interface Props {
  snap: Snapshot;
  run: Run;
}

function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <label className="setting">
      <div>
        <strong>{title}</strong>
        <p>{desc}</p>
      </div>
      <span className="toggle-row">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch" />
      </span>
    </label>
  );
}

export default function SettingsPage({ snap, run }: Props) {
  const s = snap.settings;
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    api.getAutostart().then(setAutostart);
  }, []);

  const update = (patch: Partial<Settings>) => run(() => api.saveSettings({ ...s, ...patch }), "Settings saved");

  const chooseSound = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Sounds", extensions: ["wav", "mp3", "ogg", "flac"] }] });
    if (typeof path !== "string") return;
    if (await run(() => api.setSound(path), "Warning sound changed")) api.testSound();
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
        </div>
      </header>

      <section className="card settings-group">
        <h3 className="card-title"><IconClock size={16} /> Day</h3>
        <div className="setting">
          <div>
            <strong>New day starts at</strong>
            <p>Limits reset at this hour. Playing past midnight still counts toward the previous day until then.</p>
          </div>
          <select value={s.resetHour} onChange={(e) => update({ resetHour: +e.target.value })}>
            {Array.from({ length: 13 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card settings-group">
        <h3 className="card-title"><IconBell size={16} /> Warnings</h3>
        <Toggle checked={s.overlay} onChange={(v) => update({ overlay: v })} title="On-screen banner"
          desc="An always-on-top banner at the top of the screen. Visible over borderless/windowed games." />
        <Toggle checked={s.sound} onChange={(v) => update({ sound: v })} title="Warning sound"
          desc="Plays a sound with every warning — you'll hear it even in exclusive fullscreen." />
        <div className="setting">
          <div>
            <strong>Sound</strong>
            <p>{s.soundName ? <span className="sound-name">{s.soundName}</span> : "Default beep"} · WAV, MP3, OGG or FLAC, first 10 seconds.</p>
          </div>
          <div className="setting-actions">
            <button className="btn ghost sm icon-only" title="Play" onClick={() => api.testSound()}>
              <IconPlay size={14} />
            </button>
            {s.soundName && (
              <button className="btn ghost sm" onClick={() => run(() => api.setSound(null), "Back to the default beep")}>
                Reset
              </button>
            )}
            <button className="btn ghost sm" onClick={chooseSound}>
              Choose…
            </button>
          </div>
        </div>
        <Toggle checked={s.notifications} onChange={(v) => update({ notifications: v })} title="Windows notifications"
          desc="Also sends a regular notification to the Windows action center." />
        <div className="setting">
          <div>
            <strong>Try it</strong>
            <p>Show a sample warning right now.</p>
          </div>
          <button className="btn ghost" onClick={() => api.testAlert()}>Test warning</button>
        </div>
      </section>

      <section className="card settings-group">
        <h3 className="card-title"><IconShield size={16} /> Protection</h3>
        <Toggle
          checked={!!autostart}
          onChange={(v) => run(async () => { setAutostart(await api.setAutostart(v)); }, v ? "Starts with Windows" : "Won't start with Windows")}
          title="Start with Windows"
          desc="Runs quietly in the tray at login so limits are always enforced."
        />
        <Toggle checked={s.guardQuit} onChange={(v) => update({ guardQuit: v })} title="Quit protection"
          desc="Blocks quitting the limiter while a limited app is running or a limit is locked." />
        <p className="footnote">
          Closing this window only hides it — the limiter keeps running in the system tray. While any limit is locked,
          the day start and quit protection can't be changed.
        </p>
      </section>
    </div>
  );
}
