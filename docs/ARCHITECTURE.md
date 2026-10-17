# Architecture

```
src/
  engine/        pure TypeScript, no DOM imports, fully unit-tested
    units.ts       W / mW / dBm, Hz / MHz conversions
    propagation.ts FSPL, log-distance, walls, noise, link budget
    rates.ts       SINR -> PHY rate lookup table
    validate.ts    scenario validation + InvalidScenarioError
    simulate.ts    association, SINR, airtime allocation -> SimulationResult
    metrics.ts     SimulationResult -> Metrics (pure)
    heatmap.ts     best-server RSSI grid + point inspection
    optimize.ts    deterministic greedy AP placement
  data/scenarios.ts  example scenarios as data (+ seeded client generator)
  ui/main.ts         canvas editor, panels, import/export; calls the engine only through ./engine
tests/engine.test.ts Vitest suite for the engine
scenarios/sample-scenario.json  exported scenario A (importable in the UI)
```

Data flow: `Scenario` (JSON-serialisable) → `simulate()` → `SimulationResult` → `computeMetrics()` → UI tables; `computeHeatmap()` reads the same propagation functions for the map. The optimizer calls `simulate()` + `computeMetrics()` for every candidate, so recommendations and displayed metrics can never disagree.
The UI mutates the scenario and re-runs the pipeline; there is no hidden state in the engine.
