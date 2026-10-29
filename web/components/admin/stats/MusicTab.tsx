'use client';

// What reached the air and how: listener requests (an in-memory ring) and the
// transitions record (read from the play history, so it survives restarts).

import { Card } from '../ui';
import { humanKind } from '../../../lib/statsLabels';
import { requestsHealth } from '../../../lib/statsHealth';
import { countRows, dropReasonLabel, effectLabel, effectSeamCount, reasonSummary } from '../../../lib/transitionStats';
import { BarList, Hint, MetricStrip, Pane, ScrollBox, StatCell, Table } from './kit';
import { SINCE_START, fmtInt, fmtMs, fmtPct } from './format';
import type { ByPickSourceRow, RequestsStats, TopRequesterRow, TransitionStats } from './types';

export function MusicTab({ requests, transitions }: {
  requests: RequestsStats;
  // Undefined: a controller too old to keep the record, so no card at all
  // rather than a misleading "unavailable".
  transitions: TransitionStats | null | undefined;
}) {
  return (
    <div className="grid gap-4">
      <RequestsCard requests={requests} />
      {transitions !== undefined && <TransitionsCard t={transitions} />}
    </div>
  );
}

function RequestsCard({ requests }: { requests: RequestsStats }) {
  const health = requestsHealth(requests);
  return (
    <Card
      title="Listener requests"
      sub={`songs listeners asked for · last ${requests.window} requests, ${SINCE_START} · full trace on the Dash`}
    >
      {requests.count === 0 ? (
        <Hint>no listener requests yet</Hint>
      ) : (
        <div className="grid gap-0">
          <MetricStrip>
            <StatCell
              label="Requests"
              value={fmtInt(requests.count)}
              sub={`${requests.resolved} found · ${requests.failed} not found`}
            />
            <StatCell label="Found" value={fmtPct(requests.successRate)} health={health.health} sub={health.note} />
            <StatCell
              label="Time to find"
              value={fmtMs(requests.latency.avg)}
              sub={`average · 95% within ${fmtMs(requests.latency.p95)}`}
            />
            <StatCell
              label="Artist not in library"
              value={fmtInt(requests.artistMiss.count)}
              accent={requests.artistMiss.count > 0}
              last
              sub={`${fmtPct(requests.artistMiss.rate)} of requests · a gap in the library, not a fault`}
            />
          </MetricStrip>

          <div className="stack-mobile grid grid-cols-[1fr_1fr] gap-0">
            <Pane title="How requests were matched" className="border-b border-separator-soft sm:border-r sm:border-b-0">
              {requests.byPath.length ? (
                <BarList
                  max={requests.byPath[0]?.count || 1}
                  rows={requests.byPath.map(r => ({
                    label: humanKind(r.path),
                    title: r.path,
                    count: r.count,
                    trailing: `${r.ok}/${r.count} found`,
                  }))}
                />
              ) : (
                <Hint>no paths recorded</Hint>
              )}
            </Pane>
            <div className="grid content-start gap-0">
              <Pane title="Where the pick came from">
                <ScrollBox>
                  <Table<ByPickSourceRow>
                    empty="No pick sources"
                    rows={requests.byPickSource}
                    cols={[
                      { key: 'source', label: 'Source', render: r => <span title={r.source}>{humanKind(r.source)}</span> },
                      { key: 'count', label: 'Picks', align: 'right', render: r => <span className="mono-num">{r.count}</span> },
                    ]}
                  />
                </ScrollBox>
              </Pane>
              <Pane title="Top requesters" className="border-t border-separator-soft">
                <Table<TopRequesterRow>
                  empty="No requesters"
                  rows={requests.topRequesters}
                  cols={[
                    { key: 'requester', label: 'Listener' },
                    { key: 'count', label: 'Requests', align: 'right', render: r => <span className="mono-num">{r.count}</span> },
                  ]}
                />
              </Pane>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

interface EffectDropRow {
  effect: string;
  count: number;
  reasons: string;
}

// The durable seam record as three views of one pipeline: what the DJ asked for
// on its picks, what each seam actually aired with, and why asks did not make
// it. `t` is null when the play history is unavailable.
function TransitionsCard({ t }: { t: TransitionStats | null }) {
  const sub = `how each track came in · last ${t?.days ?? 7} days, from the play history, kept across restarts`;
  if (!t || t.seams === 0) {
    return (
      <Card title="Transitions" sub={sub}>
        <Hint>
          {!t
            ? 'play history unavailable'
            : 'no transitions recorded yet — each aired track records how it came in'}
        </Hint>
      </Card>
    );
  }
  const asks = countRows(t.byAsk, effectLabel);
  const seams = countRows(t.bySeam);
  const reasons = countRows(t.byReason, dropReasonLabel);
  const withEffect = effectSeamCount(t.bySeam);
  const effectAsks = t.asked - (t.byAsk.normal ?? 0);
  const effectRows: EffectDropRow[] = Object.entries(t.byEffect ?? {})
    .map(([effect, rec]) => ({
      effect: effectLabel(effect),
      count: Object.values(rec ?? {}).reduce<number>((sum, n) => sum + (n || 0), 0),
      reasons: reasonSummary(rec),
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count || a.effect.localeCompare(b.effect));
  return (
    <Card title="Transitions" sub={sub}>
      <div className="grid gap-0">
        <MetricStrip>
          <StatCell label="Transitions" value={fmtInt(t.seams)} sub="aired tracks with a recorded way in" />
          <StatCell label="With an effect" value={fmtInt(withEffect)} accent={withEffect > 0}
            sub={`${fmtPct(withEffect / t.seams)} of transitions`} />
          <StatCell label="DJ asks" value={fmtInt(t.asked)} sub={`${fmtInt(effectAsks)} of them for an effect`} />
          <StatCell label="Dropped" value={fmtInt(t.dropped)} last
            sub="effects that did not air as chosen" />
        </MetricStrip>

        <div className="stack-mobile grid grid-cols-[1fr_1fr_1fr] gap-0">
          <Pane title="The DJ asked for" className="border-b border-separator-soft sm:border-r sm:border-b-0">
            {asks.length ? (
              <BarList max={asks[0]?.count || 1} rows={asks} />
            ) : (
              <Hint>no DJ picks recorded</Hint>
            )}
          </Pane>
          <Pane title="What aired" className="border-b border-separator-soft sm:border-r sm:border-b-0">
            <BarList max={seams[0]?.count || 1} rows={seams} />
          </Pane>
          <Pane title="Why effects were dropped">
            {reasons.length ? (
              <BarList max={reasons[0]?.count || 1} rows={reasons} />
            ) : (
              <Hint>nothing dropped</Hint>
            )}
          </Pane>
        </div>

        {effectRows.length > 0 && (
          <Pane title="Drops by effect" className="border-t border-separator-soft">
            <ScrollBox>
              <Table<EffectDropRow>
                empty="No drops"
                rows={effectRows}
                cols={[
                  { key: 'effect', label: 'Effect' },
                  { key: 'count', label: 'Dropped', align: 'right',
                    render: r => <span className="mono-num">{r.count}</span> },
                  { key: 'reasons', label: 'Why',
                    render: r => <span className="text-muted">{r.reasons}</span> },
                ]}
              />
            </ScrollBox>
          </Pane>
        )}
      </div>
    </Card>
  );
}
