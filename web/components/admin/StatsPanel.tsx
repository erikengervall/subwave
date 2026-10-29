'use client';

// The Stats page: a glance strip that answers "is the station okay" above four
// tabs (Audience, DJ & voice, Music, System). This file owns the reads and the
// tab state; each tab renders from what it is handed (./stats/*).
//
// /stats reports activity since boot, except `transitions`, which is read from
// the play history; /listeners and /audience report persisted history.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Cpu, Disc3, Mic, Users } from 'lucide-react';
import { useAdminAuth } from '../../lib/adminAuth';
import { AdminResponseError, adminJson, useAdminQuery } from '../../lib/admin-query';
import { errorMessage } from '../../lib/notify';
import { ErrorState } from '@/components/ui/error-state';
import { Card, Btn, Eyebrow } from './ui';
import { SectionTabs, type SectionTab } from './SectionTabs';
import { cn } from '../../lib/cn';
import {
  budgetHealth,
  llmHealth,
  requestsHealth,
  summarizeHealth,
  voiceHealth,
} from '../../lib/statsHealth';
import { statsKeys } from './stats-queries';
import { GlanceStrip } from './stats/GlanceStrip';
import { AudienceTab } from './stats/AudienceTab';
import { DjTab } from './stats/DjTab';
import { MusicTab } from './stats/MusicTab';
import { SystemTab } from './stats/SystemTab';
import { Hint } from './stats/kit';
import type {
  AudienceResponse,
  ConnectionsResponse,
  ListenersResponse,
  StatsResponse,
  SystemResponse,
} from './stats/types';

class StatsShapeError extends Error {}

type TabId = 'audience' | 'dj' | 'music' | 'system';

const TAB_IDS = ['audience', 'dj', 'music', 'system'] as const;

const TABS: SectionTab[] = [
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'dj', label: 'DJ & voice', icon: Mic },
  { id: 'music', label: 'Music', icon: Disc3 },
  { id: 'system', label: 'System', icon: Cpu },
];

export default function StatsPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const [paused, setPaused] = useState(false);
  const [range, setRange] = useState('1440'); // minutes — 24h default
  const enabled = hydrated && !needsAuth && !paused;

  // The active tab lives in the URL (?tab=…), read every render rather than
  // mirrored into state, because the sidebar carries these tabs as sub-items
  // and a soft nav to the same pathname does not remount (ConnectPanel has the
  // full reasoning). Unknown values fall back to Audience.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as TabId)
    : 'audience';
  const selectTab = useCallback(
    (id: string) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // /stats — usage rollups, 5s. Feeds the glance strip, so it polls on every tab.
  const statsQuery = useAdminQuery<StatsResponse>({
    key: statsKeys.rollups(), adminFetch, enabled, staleTime: 0,
    refetchInterval: () => 5_000,
    request: async (fetcher, signal) => {
      const body = await adminJson<StatsResponse>(fetcher, '/stats', undefined, signal);
      if (!body || typeof body !== 'object' || !body.llm) {
        throw new StatsShapeError(body?.error || 'unexpected response shape from /stats');
      }
      return body;
    },
  });

  // /listeners — durable time-series for the Audience chart, 30s. Soft-fails:
  // a miss leaves the last reading in place rather than erroring the page.
  const listenersQuery = useAdminQuery<ListenersResponse>({
    key: statsKeys.listeners(range), adminFetch, enabled, staleTime: 0,
    refetchInterval: () => 30_000,
    placeholderData: previous => previous,
    request: (fetcher, signal) => adminJson(fetcher, `/listeners?sinceMinutes=${range}`, undefined, signal),
  });

  // /audience — durable referral/geo rollup, 30s, soft-fail like /listeners.
  const audienceQuery = useAdminQuery<AudienceResponse>({
    key: statsKeys.audience(range), adminFetch, enabled, staleTime: 0,
    refetchInterval: () => 30_000,
    placeholderData: previous => previous,
    request: (fetcher, signal) => adminJson(fetcher, `/audience?sinceMinutes=${range}`, undefined, signal),
  });
  // Range is part of both cache keys, so keep a range-independent last success:
  // a first failure on a new range would otherwise blank the charts.
  const [lastListeners, setLastListeners] = useState<ListenersResponse | null>(null);
  const [lastAudience, setLastAudience] = useState<AudienceResponse | null>(null);
  useEffect(() => {
    if (listenersQuery.data) setLastListeners(listenersQuery.data);
  }, [listenersQuery.data]);
  useEffect(() => {
    if (audienceQuery.data) setLastAudience(audienceQuery.data);
  }, [audienceQuery.data]);

  // /listeners/connections — 30s, range-independent, Audience tab only. A 502
  // is stored as an error, not dropped, so the card can say "live detail
  // unavailable".
  const connectionsQuery = useAdminQuery<ConnectionsResponse>({
    key: statsKeys.connections(), adminFetch, enabled: enabled && tab === 'audience', staleTime: 0,
    refetchInterval: () => 30_000,
    request: async (fetcher, signal) => {
      try {
        return await adminJson<ConnectionsResponse>(
          fetcher, '/listeners/connections', undefined, signal,
        );
      } catch (error) {
        if (error instanceof AdminResponseError) {
          const detail = typeof error.body.error === 'string' ? error.body.error : null;
          return { error: detail || 'live connection detail unavailable' };
        }
        throw error;
      }
    },
  });

  // /system — per-container CPU/memory, 30s (~1s per container to sample), so
  // it polls only while the System tab is open. Soft-fails; range-independent.
  const systemQuery = useAdminQuery<SystemResponse>({
    key: statsKeys.system(), adminFetch, enabled: enabled && tab === 'system', staleTime: 0,
    refetchInterval: () => 30_000,
    request: (fetcher, signal) => adminJson(fetcher, '/system', undefined, signal),
  });

  const data = statsQuery.error instanceof StatsShapeError ? null : (statsQuery.data ?? null);
  const err = statsQuery.error ? errorMessage(statsQuery.error) : null;
  const listeners = listenersQuery.data ?? lastListeners;
  const audience = audienceQuery.data ?? lastAudience;
  const rangeLabel = range === '10080' ? '7d' : '24h';

  const llm = data?.llm;
  const tts = data?.tts;
  const djLog = data?.djLog;
  const requests = data?.requests;
  const statsReady = !!(llm && tts && djLog && requests);

  const counts = (listeners?.samples ?? []).map(s => s.count);
  const dj = llm && tts && requests
    ? summarizeHealth([llmHealth(llm), voiceHealth(tts), requestsHealth(requests), budgetHealth(llm.budget)])
    : null;

  const connecting = !err && (
    <Card title="Stats">
      <Hint>connecting…</Hint>
    </Card>
  );

  return (
    <div className="grid gap-4">
      <section className="card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink p-3.5">
          <Eyebrow className={cn(err ? 'text-[var(--danger)]' : !paused && 'text-vermilion')}>
            ● {err ? 'down' : paused ? 'paused' : 'live'}
          </Eyebrow>
          <span className="text-[11px] text-muted">
            {paused ? 'figures frozen until you resume' : 'updates every few seconds'}
          </span>
          <span className="ml-auto">
            <Btn sm onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</Btn>
          </span>
        </div>
        <GlanceStrip
          listenersNow={listeners?.current ?? null}
          peak={counts.length ? Math.max(...counts) : null}
          samples={listeners?.samples ?? []}
          rangeLabel={rangeLabel}
          listenersLoaded={listeners != null}
          visits={audience ? (audience.sessions ?? 0) : null}
          countries={audience?.countries?.length ?? 0}
          dj={dj}
          budget={llm?.budget ?? null}
          statsDown={!!err}
        />
        <SectionTabs tabs={TABS} value={tab} onChange={selectTab} label="Stats sections" />
      </section>

      {err && <ErrorState error={err} />}

      {tab === 'audience' && (
        <AudienceTab
          range={range}
          onRange={setRange}
          rangeLabel={rangeLabel}
          listeners={listeners}
          audience={audience}
          connections={connectionsQuery.data ?? null}
        />
      )}
      {tab === 'dj' && (statsReady && llm && tts && djLog
        ? <DjTab llm={llm} tts={tts} djLog={djLog} />
        : connecting)}
      {tab === 'music' && (statsReady && requests
        ? <MusicTab requests={requests} transitions={data?.transitions} />
        : connecting)}
      {tab === 'system' && (
        <SystemTab system={systemQuery.data ?? null} llm={llm} trackSelection={data?.trackSelection} />
      )}
    </div>
  );
}
