use crate::alert::{alert, Level};
use crate::model::{AppState, ToastAction, EXTRA_STEPS_MIN};
use std::collections::BTreeSet;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Emitter, Manager};

const TICK: Duration = Duration::from_millis(1000);
/// Gaps longer than this (sleep, hibernate) are not counted as play time.
const MAX_GAP_SEC: f64 = 10.0;
const SAVE_EVERY: Duration = Duration::from_secs(10);
const BLOCKED_NOTICE_EVERY: Duration = Duration::from_secs(30);

struct Proc {
    pid: Pid,
    name: String,
    path: Option<String>,
}

struct Pending {
    level: Level,
    title: String,
    body: String,
    action: Option<ToastAction>,
}

pub fn refresh(sys: &mut System) {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_exe(UpdateKind::OnlyIfNotSet)
            .with_memory(),
    );
}

/// "Use 5 more minutes" button, when an extra session can start right now.
fn extra_action(rule_id: &str, next: Option<u32>, cooling: bool) -> Option<ToastAction> {
    match next {
        Some(m) if !cooling => Some(ToastAction {
            label: format!("Use {m} more minute{}", if m == 1 { "" } else { "s" }),
            rule_id: rule_id.to_string(),
        }),
        _ => None,
    }
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut sys = System::new();
        let mut last_tick = Instant::now();
        let mut last_save = Instant::now();

        loop {
            std::thread::sleep(TICK);
            refresh(&mut sys);

            let gap = last_tick.elapsed().as_secs_f64();
            last_tick = Instant::now();
            let dt = if gap > MAX_GAP_SEC { 0.0 } else { gap };

            let procs: Vec<Proc> = sys
                .processes()
                .iter()
                .map(|(pid, p)| Proc {
                    pid: *pid,
                    name: p.name().to_string_lossy().to_lowercase(),
                    path: p.exe().map(|e| e.to_string_lossy().to_lowercase()),
                })
                .collect();

            let mut kills: Vec<Pid> = Vec::new();
            let mut alerts: Vec<Pending> = Vec::new();

            let snapshot = {
                let state = app.state::<AppState>();
                let mut g = state.0.lock().unwrap();
                let (day, now) = g.today_now();
                let reset_label = day.next_reset.format("%H:%M").to_string();
                g.running.clear();

                for rule in g.data.rules.clone().into_iter().filter(|r| r.enabled) {
                    let matched: Vec<&Proc> = procs
                        .iter()
                        .filter(|p| rule.targets.iter().any(|t| t.matches(&p.name, p.path.as_deref())))
                        .collect();
                    let running = !matched.is_empty();
                    let limit = rule.limit_sec(day.weekday);

                    let (extra, extra_ended) = g.extra_tick(&rule.id, &day.key, now);
                    let in_extra = extra.active_until.is_some();
                    let cooling = extra.cooldown_until.is_some();
                    let next_extra = if rule.allow_extra { EXTRA_STEPS_MIN.get(extra.stage as usize).copied() } else { None };

                    let used = g
                        .data
                        .usage
                        .entry(day.key.clone())
                        .or_default()
                        .entry(rule.id.clone())
                        .or_insert(0.0);
                    let was_under = *used < limit;
                    if running && was_under {
                        *used = (*used + dt).min(limit);
                    } else if running && in_extra {
                        // Extra time still shows up in the history.
                        *used += dt;
                    }
                    let used = *used;
                    if running && (was_under || in_extra) {
                        g.dirty = true;
                    }

                    if running {
                        let names: BTreeSet<String> = matched.iter().map(|p| p.name.clone()).collect();
                        g.running.insert(rule.id.clone(), names.into_iter().collect());
                    }

                    if let Some(last) = extra_ended {
                        g.blocked_notice.insert(rule.id.clone(), Instant::now());
                        alerts.push(Pending {
                            level: Level::Danger,
                            title: format!("Extra time is over — {}", rule.name),
                            body: if last {
                                format!("That was the last extra time. It unlocks at {reset_label}.")
                            } else {
                                format!(
                                    "You can come back for {} more minute{} in 5 minutes.",
                                    next_extra.unwrap_or(1),
                                    if next_extra == Some(1) { "" } else { "s" }
                                )
                            },
                            action: None,
                        });
                    }

                    // Re-arm warnings when the limit went up, and reset them on a new day.
                    let remaining = limit - used;
                    let fired = g.fired.entry(rule.id.clone()).or_insert((day.key.clone(), Vec::new()));
                    if fired.0 != day.key {
                        *fired = (day.key.clone(), Vec::new());
                    }
                    fired.1.retain(|w| remaining <= *w as f64 * 60.0);

                    if !running {
                        continue;
                    }

                    if remaining <= 0.0 && in_extra {
                        let left = extra.active_until.unwrap_or(now) - now;
                        let key = (rule.id.clone(), extra.stage);
                        let session_min = EXTRA_STEPS_MIN[(extra.stage as usize).saturating_sub(1).min(EXTRA_STEPS_MIN.len() - 1)];
                        if left <= 60 && session_min > 1 && !g.extra_warned.contains(&key) {
                            g.extra_warned.insert(key);
                            alerts.push(Pending {
                                level: Level::Warning,
                                title: format!("{} — 1 minute of extra time left", rule.name),
                                body: "Wrap up now. It will be closed when the extra time runs out.".into(),
                                action: None,
                            });
                        }
                        continue;
                    }

                    if remaining <= 0.0 {
                        kills.extend(matched.iter().map(|p| p.pid));
                        let action = extra_action(&rule.id, next_extra, cooling);
                        if was_under {
                            alerts.push(Pending {
                                level: Level::Danger,
                                title: format!("Time's up — {}", rule.name),
                                body: match next_extra {
                                    Some(m) => format!("Your daily limit is reached. Need to finish something? You can come back for {m} more minutes."),
                                    None => format!("Your daily limit is reached. It unlocks at {reset_label}."),
                                },
                                action,
                            });
                        } else {
                            let due = g
                                .blocked_notice
                                .get(&rule.id)
                                .is_none_or(|t| t.elapsed() >= BLOCKED_NOTICE_EVERY);
                            if due {
                                g.blocked_notice.insert(rule.id.clone(), Instant::now());
                                let body = match (next_extra, extra.cooldown_until) {
                                    (Some(m), Some(c)) => {
                                        let left = (c - now).max(0);
                                        format!("Extra time ({m} min) is available in {}:{:02}.", left / 60, left % 60)
                                    }
                                    (Some(m), None) => format!("You can still use {m} more minutes of extra time."),
                                    (None, _) => format!("No more play time today. Come back after {reset_label}."),
                                };
                                alerts.push(Pending {
                                    level: Level::Danger,
                                    title: format!("{} is locked", rule.name),
                                    body,
                                    action,
                                });
                            }
                        }
                        continue;
                    }

                    // Only show the most urgent warning that's due; mark the others as shown.
                    let mut due: Vec<u32> = rule
                        .warnings_min
                        .iter()
                        .copied()
                        .filter(|w| remaining <= *w as f64 * 60.0 && !fired.1.contains(w))
                        .collect();
                    due.sort_unstable();
                    if !due.is_empty() {
                        fired.1.extend(&due);
                        alerts.push(Pending {
                            level: Level::Warning,
                            title: format!("{} — {} left", rule.name, fmt_remaining(remaining)),
                            body: "Save your game now. It will be closed when the time runs out.".into(),
                            action: None,
                        });
                    }
                }

                if g.dirty && last_save.elapsed() >= SAVE_EVERY {
                    g.save();
                    last_save = Instant::now();
                }
                g.snapshot()
            };

            for pid in kills {
                kill(&sys, pid);
            }
            for a in alerts {
                alert(&app, a.level, a.title, a.body, a.action);
            }
            let _ = app.emit("snapshot", &snapshot);
        }
    });
}

fn fmt_remaining(sec: f64) -> String {
    let sec = sec.ceil() as u64;
    if sec >= 60 {
        let min = sec.div_ceil(60);
        format!("{min} minute{}", if min == 1 { "" } else { "s" })
    } else {
        format!("{sec} seconds")
    }
}

fn kill(sys: &System, pid: Pid) {
    let killed = sys.process(pid).is_some_and(|p| p.kill());
    if !killed {
        // Fallback for processes sysinfo can't terminate (also takes child processes down).
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let _ = cmd.status();
    }
}
