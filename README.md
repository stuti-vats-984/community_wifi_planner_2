# CommunityMesh – community Wi-Fi planning and optimization

Browser-based tool for planning community Wi-Fi (apartment blocks, villages, campuses): place access points and clients, see a **computed** coverage heatmap, estimate SINR, association and airtime-limited throughput, find overloaded APs, run a deterministic optimizer, and compare configurations.

> **Honest scope:** simplified propagation and capacity models. Output is an estimate, not a measurement, and does not replace a site survey. Example scenarios are illustrative and do not represent any real deployment.

Live demo: https://stuti-vats-984.github.io/community_wifi_planner/

![Screenshot: workspace](docs/screenshot-workspace.png) <!-- replace with a real capture -->
![Screenshot: optimizer before/after](docs/screenshot-optimizer.png) <!-- replace with a real capture -->

## Features
* **Propagation engine**: FSPL, log-distance (configurable n, d0), wall attenuation, thermal noise, link budget, SNR.
* **Association and capacity**: RSSI/SNR thresholds, per-AP client limits with explicit failure reasons, co-channel SINR, SINR→PHY-rate table, protocol efficiency, max-min fair airtime sharing, overload detection.
* **Optimizer**: bounded greedy AP placement scored by a documented objective; before/after metrics from the real engine; apply or reject.
* **Editor**: add/drag/edit/delete APs and clients, hover probe (RSSI/SNR/SINR/throughput estimate), JSON import/export, 3 example scenarios, snapshot comparison table.
* **Tests**: 30 unit and analytical tests for the engine.

## Quick start
```bash
npm install
npm run dev        # http://localhost:5173/community_wifi_planner/
npm test           # run engine tests
npm run build      # typecheck + production build into dist/
```
Requires Node 18+ (20 recommended).

## Deploy to GitHub Pages
1. Push this repo to `main` of `stuti-vats-984/community_wifi_planner` (keep the repo name, or change `base` in `vite.config.ts`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs tests, builds, and deploys on every push to `main`.

## Example usage
Load *C. Capacity-constrained*: signal is strong everywhere but both APs are overloaded (0 % of clients meet the throughput requirement). Click **Recommend AP placements**: the optimizer adds APs on different channels and the throughput metric rises step by step. Load *A. Small apartment block* to see weak links behind walls fixed by one extra AP.

## Project structure and docs
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SIMULATION_MODEL.md](docs/SIMULATION_MODEL.md) (equations and assumptions) and [docs/VALIDATION.md](docs/VALIDATION.md). A sample scenario is in `scenarios/sample-scenario.json` (import it via the UI).

## Key equations
`FSPL = 32.44 + 20log10(f_MHz) + 20log10(d_km)` · `PL = FSPL(d0) + 10n·log10(d/d0)` · `P_rx = P_tx + G_tx + G_rx − PL − L_walls` · `N = −174 + 10log10(B_Hz) + NF` · `SINR = S / (I + N)` (linear mW).

## Known limitations
* Not a standards-accurate 802.11 model: illustrative rate table, no MAC contention, no hidden nodes, no adjacent-channel interference, interferers always on.
* Walls are straight-line crossings with fixed loss; no reflection, diffraction, shadow fading or 3-D / floors.
* Association is greedy and order-dependent. Optimizer is greedy, adds APs only, grid-limited.
* UI is intentionally minimal: no charts yet; accessibility and mobile polish are basic.

## Future work
Charts for comparisons, AP move/channel-retune optimization, Monte Carlo over path loss, CSV/JSON report export, import of real survey data (clearly separated from simulated data).
