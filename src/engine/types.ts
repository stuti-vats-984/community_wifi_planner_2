export type PathLossModel = 'fspl' | 'log-distance';

export interface Wall { x1: number; y1: number; x2: number; y2: number; lossDb: number }

export interface AccessPoint {
  id: string; x: number; y: number;
  txPowerDbm: number; antennaGainDbi: number;
  freqMHz: number; channel: number;
  maxClients: number; costUsd: number;
}

export interface Client { id: string; x: number; y: number; demandMbps: number }

export interface Config {
  widthM: number; heightM: number;
  model: PathLossModel;
  pathLossExponent: number;   // n in log-distance model
  refDistanceM: number;       // d0 in log-distance model
  bandwidthMHz: number;
  noiseFigureDb: number;
  clientAntennaGainDbi: number;
  minRssiDbm: number;         // association / coverage threshold
  minSnrDb: number;
  protocolEfficiency: number; // application throughput / PHY rate, in (0, 1]
  minThroughputMbps: number;  // per-client service requirement
}

export interface Scenario {
  name: string; description?: string;
  config: Config; aps: AccessPoint[]; clients: Client[]; walls: Wall[];
}

export type FailureReason = 'no_ap_in_range' | 'below_threshold' | 'ap_full';

export interface ClientResult {
  id: string;
  bestApId: string | null; bestRssiDbm: number; bestSnrDb: number;
  servingApId: string | null;
  rssiDbm: number | null; snrDb: number | null; sinrDb: number | null;
  phyRateMbps: number; demandMbps: number; deliveredMbps: number; unmetMbps: number;
  failure: FailureReason | null;
  meetsSignal: boolean; meetsThroughput: boolean;
}

export interface ApResult {
  id: string; clientIds: string[];
  demandedAirtime: number;  // sum of airtime needed to carry all demand (can exceed 1)
  servedAirtime: number;    // airtime actually granted (<= 1)
  capacityMbps: number;     // upper bound: all airtime at the fastest client's rate
  deliveredMbps: number; overloaded: boolean;
}

export interface SimulationResult { noiseDbm: number; clients: ClientResult[]; aps: ApResult[] }
