'use client';

// Who is listening: the persisted listener history (trend, busiest hours), the
// live Icecast connections, and where player visits came from. The range toggle
// drives every read here except the live connections.

import { Skeleton } from '@/components/ui/skeleton';
import { Card, Seg } from '../ui';
import { fmtConnected } from '../../../lib/clientLabel';
import {
  bucketSamplesByHour,
  fmtSampleTime,
  groupConnectionsByDevice,
  isLongSpan,
  peakSample,
  timedSamples,
} from '../../../lib/audienceStats';
import { countryFlag, countryName } from '../dash/types';
import { BarList, Hint, MetricStrip, Pane, ScrollBox, StatCell } from './kit';
import { HourOfDayChart, ListenerChart, busiestHour, fmtHour } from './charts';
import { fmtAvg, fmtInt } from './format';
import type { AudienceResponse, ConnectionsResponse, ListenersResponse } from './types';

export const RANGE_OPTIONS = [
  { id: '1440', label: '24h' },
  { id: '10080', label: '7d' },
];

export function AudienceTab({ range, onRange, rangeLabel, listeners, audience, connections }: {
  range: string;
  onRange: (id: string) => void;
  rangeLabel: string;
  listeners: ListenersResponse | null;
  audience: AudienceResponse | null;
  connections: ConnectionsResponse | null;
}) {
  const samples = listeners?.samples ?? [];
  const series = timedSamples(samples);
  const counts = series.map(s => s.count);
  const peak = peakSample(series);
  const long = series.length > 1 && isLongSpan((series[series.length - 1]?.ms ?? 0) - (series[0]?.ms ?? 0));
  const low = counts.length ? Math.min(...counts) : null;
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null;
  // Same series as the trend chart, so it respects the range toggle. Local time.
  const hours = bucketSamplesByHour(samples);
  const top = busiestHour(hours);

  return (
    <div className="grid gap-4">
      <Card
        title="Listeners"
        sub={`how many people were tuned in · last ${rangeLabel} · kept across restarts`}
        right={<Seg value={range} options={RANGE_OPTIONS} onChange={onRange} aria-label="Audience range" />}
      >
        <div className="grid gap-0">
          <MetricStrip>
            <StatCell label="Now" value={fmtInt(listeners?.current ?? null)} accent />
            <StatCell
              label="Peak"
              value={fmtInt(peak?.count ?? null)}
              sub={peak && peak.count > 0 ? `at ${fmtSampleTime(peak.ms, long)}` : undefined}
            />
            <StatCell label="Average" value={fmtAvg(avg)} sub="listeners at any moment" />
            <StatCell label="Quietest" value={fmtInt(low)} last />
          </MetricStrip>
          <div className="p-3.5">
            {listeners == null ? (
              <div className="flex h-[150px] items-center justify-center">
                <Skeleton className="h-4 w-16" />
              </div>
            ) : (
              <ListenerChart samples={samples} />
            )}
          </div>
          <Pane
            className="border-t border-separator-soft"
            title="When people listen"
            note={top
              ? `busiest around ${fmtHour(top.hour)} · average per hour, your local time`
              : 'average per hour, your local time'}
          >
            {listeners == null ? (
              <div className="flex h-[110px] items-center justify-center">
                <Skeleton className="h-4 w-16" />
              </div>
            ) : (
              <HourOfDayChart buckets={hours} />
            )}
          </Pane>
        </div>
      </Card>

      <RightNowCard connections={connections} />

      <SourcesCard audience={audience} rangeLabel={rangeLabel} />
    </div>
  );
}

function RightNowCard({ connections }: { connections: ConnectionsResponse | null }) {
  const err = connections?.error ?? null;
  const list = connections?.connections ?? [];
  const count = connections?.count ?? list.length;
  const groups = groupConnectionsByDevice(list);
  const avgSeconds = list.length
    ? list.reduce((a, c) => a + (c.connectedSeconds > 0 ? c.connectedSeconds : 0), 0) / list.length
    : 0;
  return (
    <Card
      title="Right now"
      sub="who is connected, by device · live from Icecast"
      right={!err && connections != null ? (
        <span className="caption text-muted">
          {fmtInt(count)} listening{list.length ? ` · avg ${fmtConnected(avgSeconds)} in` : ''}
        </span>
      ) : null}
    >
      {err ? (
        <Hint>live detail unavailable · {err}</Hint>
      ) : connections == null ? (
        <Skeleton className="h-4 w-16" />
      ) : groups.length === 0 ? (
        <Hint>nobody connected right now</Hint>
      ) : (
        <BarList
          max={groups[0]?.count || 1}
          rows={groups.map(g => ({
            label: g.device,
            count: g.count,
            trailing: `${g.count} · ${fmtConnected(g.avgSeconds)}${
              g.count > 1 ? ` · up to ${fmtConnected(g.maxSeconds)}` : ''
            }`,
          }))}
        />
      )}
    </Card>
  );
}

function countryLabel(code: string): string {
  const flag = countryFlag(code);
  const name = countryName(code);
  return flag ? `${flag} ${name}` : name;
}

function SourcesCard({ audience, rangeLabel }: { audience: AudienceResponse | null; rangeLabel: string }) {
  const visits = audience?.sessions ?? null;
  const referrers = audience?.referrers ?? [];
  const countries = audience?.countries ?? [];
  return (
    <Card
      title="Where listeners come from"
      sub={`player visits over the last ${rangeLabel}, by the site that sent them and their country`}
    >
      {audience == null ? (
        <Skeleton className="h-4 w-16" />
      ) : (visits ?? 0) === 0 ? (
        <Hint>no visits recorded yet, sources appear as listeners arrive</Hint>
      ) : (
        <div className="grid gap-0">
          <MetricStrip>
            <StatCell label="Player visits" value={fmtInt(visits)} accent sub="one per player page load" />
            <StatCell label="Sources" value={fmtInt(referrers.length)} sub="sites that sent someone" />
            <StatCell label="Countries" value={fmtInt(countries.length)} last />
          </MetricStrip>
          <div className="stack-mobile grid grid-cols-[1fr_1fr] gap-0">
            <Pane title="Top sources" note="direct = typed in or bookmarked" className="border-b border-separator-soft sm:border-r sm:border-b-0">
              {referrers.length ? (
                <ScrollBox>
                  <BarList
                    rows={referrers.map(r => ({ label: r.source, count: r.count }))}
                    max={referrers[0]?.count || 1}
                  />
                </ScrollBox>
              ) : (
                <Hint>none</Hint>
              )}
            </Pane>
            <Pane title="Top countries">
              {countries.length ? (
                <ScrollBox>
                  <BarList
                    rows={countries.map(c => ({ label: countryLabel(c.country), count: c.count, title: c.country }))}
                    max={countries[0]?.count || 1}
                  />
                </ScrollBox>
              ) : (
                <Hint>none</Hint>
              )}
            </Pane>
          </div>
        </div>
      )}
    </Card>
  );
}
