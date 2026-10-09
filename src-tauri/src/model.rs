use chrono::{DateTime, Datelike, Duration, Local, TimeZone, Weekday};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

/// How long usage history is kept.
const HISTORY_DAYS: i64 = 60;
/// Wall-clock jumps larger than this (in seconds) while the app runs are ignored.
const CLOCK_TOLERANCE: i64 = 120;

#[derive(Clone, Copy, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TargetKind {
    /// Matches a process by its executable file name, e.g. `kenshi_x64.exe`.
    Exe,
    /// Matches every process whose executable lives inside this folder.
    Folder,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Target {
    pub kind: TargetKind,
    pub value: String,
}

impl Target {
    /// `name` and `path` must already be lowercased.
    pub fn matches(&self, name: &str, path: Option<&str>) -> bool {
        let value = self.value.to_lowercase();
        match self.kind {
            TargetKind::Exe => name == value,
            TargetKind::Folder => {
                let mut prefix = value.replace('/', "\\");
                if !prefix.ends_with('\\') {
                    prefix.push('\\');
                }
                path.is_some_and(|p| p.starts_with(&prefix))
            }
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub targets: Vec<Target>,
    pub daily_limit_min: u32,
    #[serde(default)]
    pub weekend_limit_min: Option<u32>,
    #[serde(default = "default_warnings")]
    pub warnings_min: Vec<u32>,
    /// Once the limit is reached the rule can't be edited, disabled or deleted until the next day.
    #[serde(default = "yes")]
    pub lock_when_reached: bool,
    #[serde(default = "yes")]
    pub enabled: bool,
}

impl Rule {
    pub fn limit_sec(&self, weekday: Weekday) -> f64 {
        let weekend = matches!(weekday, Weekday::Sat | Weekday::Sun);
        let min = match (weekend, self.weekend_limit_min) {
            (true, Some(m)) => m,
            _ => self.daily_limit_min,
        };
        min as f64 * 60.0
    }
}

fn default_warnings() -> Vec<u32> {
    vec![10, 5, 1]
}

fn yes() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Hour (0-12) at which a new day starts. Playing past midnight still counts as "today".
    pub reset_hour: u32,
    pub sound: bool,
    pub overlay: bool,
    pub notifications: bool,
    /// Refuse to quit while a limited app is running or a rule is locked.
    pub guard_quit: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            reset_hour: 4,
            sound: true,
            overlay: true,
            notifications: true,
            guard_quit: true,
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Data {
    pub rules: Vec<Rule>,
    pub settings: Settings,
    /// day ("YYYY-MM-DD") -> rule id -> seconds used
    pub usage: BTreeMap<String, HashMap<String, f64>>,
    /// Latest trusted timestamp ever seen; time never goes backwards past it.
    pub last_seen: i64,
}

/// Wall clock that ignores large jumps made while the app is running
/// (so moving the system clock forward doesn't unlock tomorrow early).
pub struct Clock {
    anchor_wall: i64,
    anchor_inst: Instant,
}

impl Clock {
    fn new() -> Self {
        Self {
            anchor_wall: Local::now().timestamp(),
            anchor_inst: Instant::now(),
        }
    }

    fn now(&mut self) -> i64 {
        let wall = Local::now().timestamp();
        let mono = self.anchor_wall + self.anchor_inst.elapsed().as_secs() as i64;
        if (wall - mono).abs() <= CLOCK_TOLERANCE {
            self.anchor_wall = wall;
            self.anchor_inst = Instant::now();
            wall
        } else {
            mono
        }
    }
}

pub struct DayInfo {
    pub key: String,
    pub weekday: Weekday,
    pub next_reset: DateTime<Local>,
}

pub fn day_info(t: DateTime<Local>, reset_hour: u32) -> DayInfo {
    let shifted = t - Duration::hours(reset_hour as i64);
    let next_day = shifted.date_naive().succ_opt().unwrap_or(shifted.date_naive());
    let naive = next_day.and_hms_opt(0, 0, 0).unwrap() + Duration::hours(reset_hour as i64);
    DayInfo {
        key: shifted.format("%Y-%m-%d").to_string(),
        weekday: shifted.weekday(),
        next_reset: Local.from_local_datetime(&naive).earliest().unwrap_or(t),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleStatus {
    pub rule: Rule,
    pub used_sec: f64,
    pub limit_sec: f64,
    pub running: bool,
    pub processes: Vec<String>,
    pub reached: bool,
    pub locked: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub day: String,
    pub next_reset: String,
    pub rules: Vec<RuleStatus>,
    pub settings: Settings,
    pub can_quit: bool,
}

#[derive(Clone, Serialize)]
pub struct Toast {
    pub level: String,
    pub title: String,
    pub body: String,
}

pub struct Inner {
    pub data: Data,
    clock: Clock,
    /// rule id -> names of matching processes currently running
    pub running: HashMap<String, Vec<String>>,
    /// rule id -> (day, warnings already shown that day)
    pub fired: HashMap<String, (String, Vec<u32>)>,
    /// rule id -> last time a "this app is locked" notice was shown
    pub blocked_notice: HashMap<String, Instant>,
    pub toast: Option<Toast>,
    pub dirty: bool,
    path: PathBuf,
}

pub struct AppState(pub Mutex<Inner>);

impl Inner {
    /// Returns the state and whether this is the first run (no data file yet).
    pub fn load(path: PathBuf) -> (Self, bool) {
        let existing = std::fs::read_to_string(&path).ok();
        let first_run = existing.is_none();
        let data = existing
            .and_then(|s| serde_json::from_str::<Data>(&s).ok())
            .unwrap_or_default();
        let inner = Self {
            data,
            clock: Clock::new(),
            running: HashMap::new(),
            fired: HashMap::new(),
            blocked_notice: HashMap::new(),
            toast: None,
            dirty: first_run,
            path,
        };
        (inner, first_run)
    }

    pub fn save(&mut self) {
        let today = self.today().key;
        let cutoff = (chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d").unwrap()
            - Duration::days(HISTORY_DAYS))
        .format("%Y-%m-%d")
        .to_string();
        self.data.usage.retain(|day, _| *day >= cutoff);

        if let Ok(json) = serde_json::to_string_pretty(&self.data) {
            let tmp = self.path.with_extension("json.tmp");
            if std::fs::write(&tmp, json).is_ok() && std::fs::rename(&tmp, &self.path).is_ok() {
                self.dirty = false;
            }
        }
    }

    /// Trusted current time: never earlier than anything seen before.
    pub fn now(&mut self) -> DateTime<Local> {
        let t = self.clock.now().max(self.data.last_seen);
        self.data.last_seen = t;
        Local.timestamp_opt(t, 0).single().unwrap_or_else(Local::now)
    }

    pub fn today(&mut self) -> DayInfo {
        let now = self.now();
        day_info(now, self.data.settings.reset_hour)
    }

    pub fn status_of(&self, rule: &Rule, day: &DayInfo) -> RuleStatus {
        let used = self
            .data
            .usage
            .get(&day.key)
            .and_then(|m| m.get(&rule.id))
            .copied()
            .unwrap_or(0.0);
        let limit = rule.limit_sec(day.weekday);
        let reached = rule.enabled && used >= limit;
        let processes = self.running.get(&rule.id).cloned().unwrap_or_default();
        RuleStatus {
            rule: rule.clone(),
            used_sec: used,
            limit_sec: limit,
            running: !processes.is_empty(),
            processes,
            reached,
            locked: reached && rule.lock_when_reached,
        }
    }

    pub fn is_locked(&mut self, rule_id: &str) -> bool {
        let day = self.today();
        self.data
            .rules
            .iter()
            .find(|r| r.id == rule_id)
            .is_some_and(|r| self.status_of(r, &day).locked)
    }

    pub fn any_locked(&mut self) -> bool {
        let day = self.today();
        self.data.rules.iter().any(|r| self.status_of(r, &day).locked)
    }

    pub fn snapshot(&mut self) -> Snapshot {
        let day = self.today();
        let rules: Vec<RuleStatus> = self.data.rules.iter().map(|r| self.status_of(r, &day)).collect();
        let busy = rules.iter().any(|r| r.locked || (r.running && r.rule.enabled));
        Snapshot {
            day: day.key.clone(),
            next_reset: day.next_reset.to_rfc3339(),
            can_quit: !self.data.settings.guard_quit || !busy,
            settings: self.data.settings.clone(),
            rules,
        }
    }

    pub fn next_reset_label(&mut self) -> String {
        self.today().next_reset.format("%H:%M").to_string()
    }
}
