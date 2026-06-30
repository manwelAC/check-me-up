# check-me-up 🕵️

> A brutally honest distraction tracker for your terminal. No cloud. No accounts. Just the truth about where your time actually goes.

---

## The Problem

You think you worked for 4 hours. You actually worked for 2 hours and 3 minutes — the rest was YouTube, Reddit, and staring at Slack. Most distraction trackers are either bloated apps, require subscriptions, or sync your data to the cloud. `check-me-up` is different: it runs quietly in the background, stores everything locally, and tells you the truth when you ask for it.

---

## What It Does

- Tracks which app or window is actively in focus
- Detects idle time via keyboard and mouse inactivity
- Stores all data locally in a SQLite database
- Generates clean, readable reports directly in the terminal
- Lets you define which apps count as "productive" vs "distracting"

---

## CLI Commands

```bash
# Daemon control
check-me start              # Start background tracking
check-me stop               # Stop tracking
check-me status             # Check if daemon is running

# Reports
check-me report             # Today's summary
check-me report --week      # This week's breakdown
check-me report --date 2025-06-25   # Specific date
check-me report --app "YouTube"     # Drill into one app

# Configuration
check-me config set productive "VS Code, Terminal, Figma"
check-me config set distracting "YouTube, Twitter, Reddit"
check-me config show

# Data management
check-me clear --before 30d  # Clear data older than 30 days
check-me export --format csv # Export raw data
```

---

## Sample Report Output

```
───────────────────────────────────────────
  audit-me · Daily Report · June 29, 2025
───────────────────────────────────────────

  Total tracked time     8h 12m
  Active time            5h 44m
  Idle time              2h 28m

  Focus score            62/100  ⚠️

  TOP APPS
  ────────────────────────────────
  VS Code          ████████░░  3h 02m  ✅
  Chrome           █████░░░░░  1h 48m  ⚠️
  YouTube          ███░░░░░░░  0h 54m  ❌
  Slack            ██░░░░░░░░  0h 41m  ⚠️
  Terminal         █░░░░░░░░░  0h 19m  ✅

  LONGEST FOCUS STREAK     1h 14m (10:02 AM – 11:16 AM)
  WORST DISTRACTION WINDOW 2:00 PM – 3:30 PM

  TIP  You spent 54 minutes on YouTube between 2–4 PM.
       Consider blocking it during your afternoon window.
───────────────────────────────────────────
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | Node.js | Consistent with `docs-for-me`, great ecosystem |
| Storage | SQLite (via `better-sqlite3`) | Local, fast, zero setup |
| Active window | `active-win` | Cross-platform window detection |
| Idle detection | `@paymoapp/desktop-idle` | Keyboard + mouse inactivity |
| Daemon | Native background process | Lightweight, no dependencies |
| CLI framework | `commander` + `chalk` | Clean argument parsing and terminal output |

---

## Architecture

```
audit-me/
├── bin/
│   └── audit-me.js          # CLI entry point
├── src/
│   ├── daemon/
│   │   ├── index.js          # Daemon process manager
│   │   ├── tracker.js        # Active window + idle polling loop
│   │   └── store.js          # SQLite write operations
│   ├── report/
│   │   ├── daily.js          # Daily report generator
│   │   ├── weekly.js         # Weekly report generator
│   │   └── renderer.js       # Terminal output formatting
│   ├── config/
│   │   └── index.js          # User config management
│   └── db/
│       ├── schema.js          # SQLite schema + migrations
│       └── queries.js         # Read queries for reports
├── package.json
└── README.md
```

---

## Database Schema

```sql
-- Sessions: each continuous period of activity
CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name    TEXT NOT NULL,
  window_title TEXT,
  started_at  INTEGER NOT NULL,  -- Unix timestamp
  ended_at    INTEGER,
  is_idle     INTEGER DEFAULT 0  -- 1 if idle during this session
);

-- Config: user-defined categories
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## How It Works

1. `check-me-up start` spawns a detached background process (the daemon)
2. The daemon polls the active window every **5 seconds** using `active-win`
3. Keyboard/mouse idle time is checked via `@paymoapp/desktop-idle`
4. Each session (app + time range) is written to SQLite
5. When you run `check-me-up report`, it reads from SQLite and renders the report

---

## Cross-Platform Support

| OS | Active Window | Idle Detection | Status |
|---|---|---|---|
| macOS | ✅ native | ✅ native | Full support |
| Windows | ✅ native | ✅ native | Full support |
| Linux | ✅ X11/Wayland | ✅ via xinput | Best effort |

---

## Roadmap

### v1.0 — Core
- [x] Background daemon (start/stop/status)
- [x] Active window tracking
- [x] Idle detection
- [x] SQLite storage
- [x] Daily + weekly terminal reports
- [x] Productive/distracting app categories

### v1.1 — Polish
- [ ] Focus score algorithm
- [ ] Longest focus streak detection
- [ ] Worst distraction window detection
- [ ] Data export (CSV/JSON)
- [ ] Auto-clear old data

### v2.0 — AI Insights *(future)*
- [ ] `audit-me report --insights` — AI-generated summary of your week
- [ ] Pattern detection ("You're most focused on Tuesday mornings")
- [ ] Personalized suggestions based on your habits

---

## Why This Stands Out

- **Privacy-first** — everything stays on your machine, no accounts, no telemetry
- **Zero friction** — one command to start, one to report
- **System-level** — touches OS APIs, background processes, and local databases
- **Extensible** — AI insights, webhooks, and integrations are natural next steps
- **Portfolio-worthy** — demonstrates daemon architecture, cross-platform APIs, CLI design, and data modeling in one project

---

## NPM Package Name Ideas

- `check-me-up`

---

## Key Take notes from User - me

- What if the person is really idling and not using the device, how do we suddenly stop if there are no really activities?

- if there are multiple windows opened and only one is really being used like for example window 1 Brave browser Youtube: open but I'm not really using it, I'm coding in vscode..?

- if the check-me-up is running does it also record itself? 

*Built with Node.js · Runs locally · No cloud · No BS*