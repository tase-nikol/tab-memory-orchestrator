Tab Memory Orchestrator - Architecture
--------------------------------------

### Overview

This project consists of:

-   A Chrome MV3 extension (UI + policy execution)

-   A Rust native host (system metrics + pressure scoring)

### High-Level Flow

1.  Extension requests system state every 30s.

2.  Native host collects:

    -   RAM

    -   CPU

    -   Battery

3.  Rust computes:

    -   pressure_score (0-100)

    -   pressure_level (LOW/MEDIUM/HIGH)

    -   pressure_reasons

4.  Extension:

    -   Applies TTL + Focus Mode heuristics

    -   Selects eligible tabs

    -   Discards safely

### Separation of Concerns

Rust:

-   OS metrics

-   Deterministic pressure scoring

-   No tab logic

Extension:

-   Browser lifecycle control

-   Cluster heuristics

-   UI and user preferences

### Safety Guarantees

-   Never discard active tabs

-   Never discard pinned tabs

-   Never discard audible tabs

-   Respect protected domains

-   TTL gating

-   Cooldown enforcement