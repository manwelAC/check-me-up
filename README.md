<div align="center">
  <img src="https://i.pinimg.com/736x/dc/55/c1/dc55c1f38ef889b5c9ef5fd6f9e62d3f.jpg" alt="check-me-up logo" width="360">

  <h1>check-me-up</h1>
</div>

A local-first distraction and focus tracker for your terminal.

`check-me-up` runs a small background daemon, watches the currently focused window, detects idle time, stores everything on your machine, and renders readable daily or weekly reports when you ask for them.

## Features

- Tracks the active app and window title every 5 seconds
- Detects idle time from keyboard and mouse inactivity
- Stores activity locally in `~/.check-me/check-me.db`
- Provides daily, weekly, app-specific, and live terminal reports
- Lets you classify apps as productive, distracting, or ignored
- Includes an Electron GUI entry point and portable Windows build config

## Configuration

The app stores simple user preferences for classifying tracked activity:

| Key | Purpose |
| --- | --- |
| `user_name` | Optional display name |
| `productive` | Comma-separated productive app/window matches |
| `distracting` | Comma-separated distracting app/window matches |
| `ignored` | Comma-separated app/window matches to skip |
| `idle_threshold` | Seconds of inactivity before time is marked idle |

## Local Data

Runtime files are stored in your home directory:

| File | Purpose |
| --- | --- |
| `~/.check-me/check-me.db` | SQLite database |
| `~/.check-me/daemon.log` | Daemon logs |
| `~/.check-me/daemon.pid` | Running daemon process id |

No cloud service or account is required.

## Project Structure

```text
bin/
  check-me.js              CLI entry point
src/
  config/
    index.js               User configuration helpers
  daemon/
    index.js               Daemon process manager
    tracker.js             Active-window and idle polling loop
  db/
    schema.js              SQLite schema and runtime paths
    queries.js             Report and maintenance queries
  main/
    main.js                Electron main process
    preload.js             Electron preload bridge
    gui.js                 GUI launcher helpers
  renderer/
    index.html             Electron renderer HTML
    index.css              Electron renderer styles
    renderer.js            Electron renderer behavior
  report/
    daily.js               Daily report rendering
    weekly.js              Weekly report rendering
    live.js                Live dashboard
    renderer.js            Shared terminal report formatting
```

## Privacy

`check-me-up` is designed to stay local. It records app names, window titles, timestamps, idle state, and app paths in a SQLite database on your machine.

Review your exported data before sharing it, since window titles may contain sensitive information.
