Tab Memory Orchestrator
=======================

Pressure-aware Chrome tab lifecycle management using a hybrid MV3 extension and a Rust native host.

* * * * *

Why This Exists
---------------

Over time, Chrome would gradually consume RAM in ways that affected the rest of my system. Other applications would freeze or slow down, not because of one specific tab, but because of accumulated background state.

Most tab suspension extensions rely only on inactivity timers.

They don't know:

-   Whether the system is under memory pressure

-   Whether CPU is spiking

-   Whether you're on battery

-   Whether a tab is part of your active workflow

This project explores a different approach:

> A deterministic, pressure-aware, context-sensitive tab orchestration engine.

No cloud. No telemetry. No black-box AI.

* * * * *

Architecture
------------

The system is split into two components:


```text
Chrome Extension (MV3)
  - Tab activity tracking
  - Focus clustering
  - TTL gating & guardrails
        ↓ Native Messaging
Rust Native Host
  - System metrics (RAM, CPU, Battery)
  - Pressure scoring engine
  - Deterministic classification
```

### Separation of Concerns

-   The **extension** manages browser lifecycle.

-   The **Rust native host** understands system state.

-   Communication happens via Chrome Native Messaging.

This keeps browser logic and system logic cleanly separated.

For a deeper breakdown, see: `docs/ARCHITECTURE.md`

* * * * *

Core Concepts
-------------

### Pressure Scoring (Rust)

The native host collects:

-   Total RAM

-   Used RAM

-   Free RAM

-   CPU usage

-   Battery state (if available)

It computes:

-   `pressure_score` (0-100)

-   `pressure_level` (LOW / MEDIUM / HIGH)

-   `pressure_reasons` (RAM_HIGH, CPU_ELEVATED, ON_BATTERY, etc.)

RAM is the dominant signal.\
CPU and battery act as modifiers.

The goal is deterministic and explainable behavior.

* * * * *

### Focus Mode (Context Awareness)

Not all inactive tabs are equal.

Focus clustering is based on:

-   Same hostname as active tab

-   Recent activity window

-   Same window constraint

-   Cluster size cap

Tabs inside the active cluster use a longer TTL.\
Tabs outside the cluster are eligible sooner under pressure.

This reduces disruption while preserving active workflows.

* * * * *

### Guardrails

The system never:

-   Discards active tabs

-   Discards pinned tabs

-   Discards audible tabs

-   Discards protected domains

Cooldowns and TTL gates prevent oscillation or surprise behavior.

* * * * *

Project Structure
-----------------
```text
tab-memory-orchestrator/
  extension/
    background.js (MV3 module)
    src/
      settings.js
      focus.js
      candidates.js
      prune.js
      native.js
      activity.js
      state.js
    popup.html
    options.html
  native-host/
    Cargo.toml
    src/
      main.rs
      protocol.rs
      metrics.rs
      battery.rs
      pressure.rs
      state.rs
  docs/
    ARCHITECTURE.md
```
* * * * *

Installation (macOS - Experimental)
-----------------------------------

This project uses Chrome Native Messaging and requires a Rust native host.

### 1\. Build the Rust native host
```bash
cd native-host\
cargo build --release
```
### 2\. Register Native Messaging host

Create:
```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
```
Add:
```text
com.tasenikol.tab_memory_orchestrator.json
```
With contents similar to:
```json
{
  "name": "com.tasenikol.tab_memory_orchestrator",
  "description": "Tab Orchestrator Native Host (Rust)",
  "path": "/absolute/path/to/native-host/target/release/tab_orchestrator_host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<your-extension-id>/"
  ]
}
```

### 3\. Load the extension

-   Open `chrome://extensions`

-   Enable Developer Mode

-   Click **Load unpacked**

-   Select the `extension/` directory

* * * * *

Platform Support
----------------

Currently tested on:

-   macOS (primary target)

The Rust native host is cross-platform by design, but installation paths differ on Windows/Linux.

* * * * *

What This Is (and Isn't)
------------------------

This is:

-   A systems-oriented experiment

-   A pressure-aware lifecycle engine

-   A hybrid Rust + Chrome architecture

-   Deterministic and explainable

This is not:

-   A commercial product

-   An AI-powered optimizer

-   A cloud-based analytics tool

* * * * *

Future Directions
-----------------

-   Event-driven pressure signals instead of polling

-   Chrome process memory integration

-   Predictive return probability modeling

-   Offline tab lifecycle analysis

-   Adaptive TTL tuning