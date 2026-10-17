# Validation

Command: `npm test` (Vitest 2.x). Result of the run recorded when this repository was generated: **1 file, 30 tests, 30 passed**. Re-run it yourself before quoting the numbers; they are not guaranteed for your environment.

## Analytical checks (hand-calculated)

| Check | Expected |
|---|---|
| FSPL(2437 MHz, 100 m) | 32.44 + 67.737 − 20 = 80.18 dB |
| FSPL(2400 MHz, 1 km) | 100.04 dB |
| Doubling distance | +6.02 dB |
| 5180 vs 2437 MHz, same distance | +20·log10(5180/2437) dB |
| Log-distance at d0, and with n = 2 | equals FSPL |
| Noise, 20 MHz, NF 0 / 7 dB | −100.99 / −93.99 dBm; 40 MHz = +3.01 dB |
| Link budget 20 dBm + 2 dBi − 80.18 dB | −58.18 dBm |
| SNR | P_rx − N |
| SINR with co-channel interferer | recomputed in the test from linear mW and compared |
| Different channels | SINR = SNR |
| Unit conversions | 20 dBm = 100 mW, 1 W = 30 dBm, round trips |

## Behavioural checks

Threshold association and failure reasons; `maxClients` respected and `ap_full` clients still counted as in coverage; fallback to next AP; delivered ≤ demand; per-AP airtime ≤ 1 and delivered ≤ modeled capacity; overload flagged only when airtime demand > 1; max-min fairness; metrics equal aggregates of client/AP results; identical output on repeated runs and seeded scenario generation; invalid inputs (NaN, negative, zero frequency, duplicate ids) rejected; heatmap cells equal the link budget at the cell centre; point inspection agrees with the simulator; optimizer deterministic, improves scenarios A and C, and its "after" metrics equal a fresh simulation.

## What is NOT validated

No comparison against real RF measurements, a standards-compliant 802.11 simulator, or ns-3. Passing these tests shows the code implements the documented equations correctly, not that the model predicts a real site.
