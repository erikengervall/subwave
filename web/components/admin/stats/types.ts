// Response shapes for the Stats page's five reads. /stats reports activity
// since the controller started (its `transitions` section excepted, which is
// read from the play history); /listeners and /audience are persisted history.

import type { ListenerConnection } from '../../../lib/clientLabel';
import type { ListenerSample } from '../../../lib/audienceStats';
import type { MixDropReason, TransitionEffect } from '@/lib/schemas.generated';

export interface LatencyStats {
  avg?: number;
  p50?: number;
  p95?: number;
  max?: number;
}

export interface TokenStats {
  total?: number;
  input?: number;
  output?: number;
}

export interface ByKindRow {
  kind: string;
  count: number;
  ok: number;
  avgMs?: number;
  tokens?: number;
}

export interface ByModelRow {
  model: string;
  count: number;
  tokens?: number;
  costUsd?: number;
  priced?: boolean;
}

export interface ContextWindowRow {
  kind: string;
  calls: number;
  samples: number;
  averageInputTokens: number | null;
  peakInputTokens: number | null;
}

export interface ShortlistContextWindow {
  samples: number;
  // Largest prompt the window must hold: this route's picker plus every LLM
  // function sharing the one num_ctx. pickerPeakInputTokens is the route's own.
  peakInputTokens: number | null;
  pickerPeakInputTokens?: number | null;
  peakKind?: string | null;
  suggestedTokens: number | null;
  headroomPct?: number;
  responseReserveTokens?: number;
  message: string;
}

export interface ByEngineRow {
  engine: string;
  count: number;
  ok: number;
  avgMs?: number;
}

export interface ByTtsKindRow {
  kind: string;
  count: number;
  avgMs?: number;
}

export interface ByDjKindRow {
  kind: string;
  count: number;
}

export interface LlmStats {
  window: number;
  count: number;
  ok: number;
  failed: number;
  successRate?: number;
  latency: LatencyStats;
  tokens?: TokenStats;
  cost?: { usd: number; complete: boolean } | null;
  provider?: string;
  agent: { calls: number; avgSteps?: number; avgTools?: number };
  byKind: ByKindRow[];
  byModel: ByModelRow[];
  contextWindows?: {
    shortlist: ShortlistContextWindow;
    agenticPicker: ShortlistContextWindow;
    byKind: ContextWindowRow[];
  };
  activeModel?: string;
  budget?: {
    enabled: boolean;
    cap: number;
    softPct: number;
    usedToday: number;
    remaining: number | null;
    mode: 'normal' | 'soft' | 'hard';
  };
}

export interface TtsStats {
  window: number;
  count: number;
  ok: number;
  failed: number;
  latency: LatencyStats;
  fellBack: number;
  fallbackRate?: number;
  chars?: number;
  byEngine: ByEngineRow[];
  byKind: ByTtsKindRow[];
}

export interface DjLogStats {
  count: number;
  byKind: ByDjKindRow[];
}

export interface ByPathRow {
  path: string;
  count: number;
  ok: number;
}

export interface ByPickSourceRow {
  source: string;
  count: number;
}

export interface TopRequesterRow {
  requester: string;
  count: number;
}

export interface RequestsStats {
  window: number;
  count: number;
  resolved: number;
  failed: number;
  successRate?: number | null;
  latency: LatencyStats;
  artistMiss: { count: number; rate?: number | null };
  byPath: ByPathRow[];
  byPickSource: ByPickSourceRow[];
  topRequesters: TopRequesterRow[];
}

// The durable seam record, from library.db `plays` over the last `days` days —
// unlike the in-memory rollups above, it survives a controller restart. Null
// when the library DB is unavailable.
export interface TransitionStats {
  days: number;
  since: string;
  seams: number;                          // plays with a recorded seam label
  bySeam: Record<string, number>;         // label of the seam INTO the track ('Normal', 'Washout + Sweep', …)
  asked: number;                          // DJ picks with a recorded ask
  byAsk: Record<string, number>;          // the DJ's ask before any strip ('normal' | effect id)
  dropped: number;
  byReason: Partial<Record<MixDropReason, number>>;
  byEffect: Partial<Record<TransitionEffect, Partial<Record<MixDropReason, number>>>>;
}

export interface StatsResponse {
  llm?: LlmStats;
  trackSelection?: 'agentic' | 'shortlist';
  tts?: TtsStats;
  djLog?: DjLogStats;
  requests?: RequestsStats;
  transitions?: TransitionStats | null;
  error?: string;
}

export interface ListenersResponse {
  current?: number | null;
  sinceMinutes?: number;
  bytes?: number;
  samples?: ListenerSample[];
  error?: string;
}

export interface AudienceResponse {
  sinceMinutes?: number;
  sessions?: number;
  referrers?: { source: string; count: number }[];
  countries?: { country: string; count: number }[];
  paths?: { path: string; count: number }[];
  error?: string;
}

// Deduped one row per listener by the server. `error` is set on a 502 (Icecast
// admin unreachable) so "nobody connected" stays distinct from "couldn't read".
export interface ConnectionsResponse {
  count?: number;
  connections?: ListenerConnection[];
  error?: string;
}

export interface ContainerUsage {
  name: string;
  service: string;
  cpuPct: number;
  memUsed: number;
  memLimit: number;
  memPct: number;
}

export interface HostUsage {
  cpus: number;
  loadavg: [number, number, number];
  memTotal: number;
  memUsed: number;
  uptime: number;
}

export interface SystemResponse {
  t?: string;
  dockerAvailable?: boolean;
  dockerError?: string;
  host?: HostUsage;
  containers?: ContainerUsage[];
  error?: string;
}
