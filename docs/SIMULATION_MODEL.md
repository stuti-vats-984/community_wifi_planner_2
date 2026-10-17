# Simulation model

All quantities are SI/engineering units: power in dBm (linear mW for sums), frequency in MHz, bandwidth in MHz (Hz inside the noise formula), distance in metres, rates in Mbps.
These are **simplified models**. They are not measurements and do not replace a site survey.

## 1. Propagation (`src/engine/propagation.ts`)

| Model | Equation |
|---|---|
| Free-space path loss | `FSPL(dB) = 32.44 + 20·log10(f_MHz) + 20·log10(d_km)` |
| Log-distance | `PL(d) = FSPL(d0) + 10·n·log10(d / d0)`, default `d0 = 1 m`, `n` configurable (≈2 open space, ≈3–3.5 indoor/obstructed) |
| Walls | `L_walls = Σ loss_i` over every wall segment the straight AP→client line properly crosses (no reflection or diffraction) |

Distances below `max(1 m, d0)` are clamped. With `n = 2` the log-distance model reproduces FSPL exactly.

## 2. Link budget, noise, SNR

```
P_rx (dBm) = P_tx + G_tx + G_rx − PL − L_walls
N (dBm)    = −174 + 10·log10(B_Hz) + NF          (thermal noise density −174 dBm/Hz)
SNR (dB)   = P_rx − N
```
`RSSI` in this tool means the modeled received power `P_rx`.

## 3. Association (`simulate.ts`)

1. Clients are processed strongest-best-server first (ties: input order). This is greedy and **order-dependent**.
2. A client is *eligible* for an AP when `RSSI ≥ minRssi` and `SNR ≥ minSnr`.
3. It joins the strongest eligible AP with a free slot (`maxClients`).
4. Failure reasons: `no_ap_in_range` (best SNR < 0 dB, or no APs), `below_threshold` (signal exists but fails thresholds), `ap_full` (eligible APs exist, all at capacity).

"Meets signal requirement" is evaluated against the **best server**, so a client can be in coverage yet unassociated (`ap_full`).

## 4. Interference and SINR

```
I (mW)     = Σ P_rx,j (mW) over all other APs j on the same frequency AND channel number
SINR (dB)  = 10·log10( S_mW / (I_mW + N_mW) )
```
Limitations: interferers are assumed always transmitting (worst case, ignores duty cycle); adjacent/partially overlapping channels are ignored; no capture effect, hidden nodes, or CSMA deferral.

## 5. PHY rate, throughput, airtime

* `PHY rate = table(SINR) · (B / 20 MHz)` using the illustrative table in `rates.ts` (thresholds 2…29 dB → 6.5…78 Mbps at 20 MHz). It is **not** the 802.11 MCS table.
* `Application throughput = protocolEfficiency · PHY rate` (default 0.6 as an illustrative MAC/protocol overhead factor).
* Airtime a client needs: `need_i = demand_i / (eff · rate_i)`. Each AP has 1.0 airtime in total, split by **max-min fairness** (water-filling): small flows are fully served first, the remainder is shared equally.
* `delivered_i = alloc_i · eff · rate_i ≤ demand_i`; `unmet_i = demand_i − delivered_i`.
* An AP is **overloaded** when `Σ need_i > 1`.
* `capacityMbps` (per AP) = `eff · max_i rate_i`, an upper bound used as a sanity check (the AP cannot deliver more than all airtime at its fastest client's rate).

## 6. Metrics

Computed only from the per-client / per-AP results (`metrics.ts`). RSSI and SINR statistics cover associated clients. `% meeting throughput` = clients with `delivered ≥ min(demand, minThroughput)`.

## 7. Optimizer (`optimize.ts`)

Bounded greedy search. Objective (higher is better):
```
score = w_s·%meetingSignal + w_t·%meetingThroughput − w_o·overloadedAPs − w_c·equipmentCostUSD
```
Defaults `w_s=1, w_t=1, w_o=10, w_c=0.01`. Each step simulates every (grid-cell-centre × channel∈{1,6,11}) candidate with the full engine and adds the best one. Ties go to the lowest x, then y, then channel. Stops at the target (default 95 % for both service metrics), after `maxNewAps` (default 4), or when no candidate improves the score. Greedy search is not globally optimal and only adds APs (it does not move or retune existing ones).

## Theory vs simulation vs measurement

* **Theoretical estimate**: a closed-form equation (e.g. FSPL). Validated analytically in the tests.
* **Simulated metric**: output of this pipeline on a synthetic scenario. Deterministic, but only as good as the assumptions above.
* **Real measurement**: RSSI/throughput recorded on hardware. Nothing in this repository is a measurement.
