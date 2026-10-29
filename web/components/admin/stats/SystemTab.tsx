'use client';

// The engine room: host and container load, and the Ollama context-window
// sizing, which is a tuning aid for Settings → LLM rather than a station stat.

import { Skeleton } from '@/components/ui/skeleton';
import { Card, Pill } from '../ui';
import { loadHealth, memoryHealth } from '../../../lib/statsHealth';
import { Bar, Hint, MetricStrip, ScrollBox, StatCell, Table } from './kit';
import { SINCE_START, fmtBytes, fmtInt, fmtTokens } from './format';
import type { ContainerUsage, ContextWindowRow, LlmStats, StatsResponse, SystemResponse } from './types';

export function SystemTab({ system, llm, trackSelection }: {
  system: SystemResponse | null;
  llm: LlmStats | undefined;
  trackSelection: StatsResponse['trackSelection'];
}) {
  return (
    <div className="grid gap-4">
      <ServerCard system={system} />
      {llm && <ContextCard llm={llm} trackSelection={trackSelection} />}
    </div>
  );
}

function ServerCard({ system }: { system: SystemResponse | null }) {
  const host = system?.host ?? null;
  const containers = system?.containers ?? [];
  const load = loadHealth(host);
  const memory = memoryHealth(host);
  // docker stats reports CPU per core, so a container can pass 100% on a
  // multi-core host; the bar is its share of the whole machine.
  const cores = host?.cpus || 1;
  return (
    <Card title="Server" sub="CPU and memory for the SUB/WAVE containers on this host · live">
      {system == null ? (
        <Skeleton className="h-4 w-16" />
      ) : (
        <div className="grid gap-0">
          <MetricStrip>
            <StatCell label="CPU cores" value={fmtInt(host?.cpus)} />
            <StatCell
              label="Load (1 min)"
              value={host ? host.loadavg[0].toFixed(2) : '—'}
              health={load.health}
              sub={host
                ? `${host.loadavg[1].toFixed(2)} over 5 min · ${host.loadavg[2].toFixed(2)} over 15 min · busy past ${host.cpus}`
                : undefined}
            />
            <StatCell
              label="Host memory"
              value={fmtBytes(host?.memUsed)}
              health={memory.health}
              sub={host ? `of ${fmtBytes(host.memTotal)} · ${memory.note}` : undefined}
            />
            <StatCell label="Containers" value={fmtInt(containers.length)} last />
          </MetricStrip>
          <div className="p-3.5">
            {!system.dockerAvailable ? (
              <Hint>
                container stats unavailable — start the docker-socket-proxy
                sidecar (docker compose up -d) to enable
                {system.dockerError ? ` · ${system.dockerError}` : ''}
              </Hint>
            ) : containers.length === 0 ? (
              <Hint>no containers reporting</Hint>
            ) : (
              <ScrollBox>
                <Table<ContainerUsage>
                  empty="No containers"
                  rows={containers}
                  cols={[
                    { key: 'service', label: 'Service' },
                    {
                      key: 'cpuPct', label: 'CPU', align: 'right',
                      render: r => (
                        <span className="inline-flex items-center justify-end gap-2.5">
                          <Bar frac={r.cpuPct / (100 * cores)} tone="ink" className="hidden w-20 sm:block" />
                          <span className="mono-num w-[6ch]">{r.cpuPct.toFixed(1)}%</span>
                        </span>
                      ),
                    },
                    {
                      key: 'memUsed', label: 'Memory', align: 'right',
                      render: r => (
                        <span className="inline-flex items-center justify-end gap-2.5">
                          <Bar frac={r.memPct / 100} tone={r.memPct >= 90 ? 'accent' : 'ink'} className="hidden w-20 sm:block" />
                          <span className="mono-num w-[7ch]">{fmtBytes(r.memUsed)}</span>
                          <span className="mono-num w-[6ch] text-muted">{r.memPct.toFixed(1)}%</span>
                        </span>
                      ),
                    },
                  ]}
                />
              </ScrollBox>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ContextCard({ llm, trackSelection }: { llm: LlmStats; trackSelection: StatsResponse['trackSelection'] }) {
  const context = llm.contextWindows;
  const shortlist = context?.shortlist;
  const agenticPicker = context?.agenticPicker;
  const rows = context?.byKind ?? [];
  // Lead with the route the station is actually running.
  const active = trackSelection === 'shortlist'
    ? { label: 'shortlist', window: shortlist }
    : { label: 'Agentic', window: agenticPicker };
  return (
    <Card
      title="Model context sizing"
      sub={`the num_ctx Ollama needs to hold every prompt · from prompt sizes ${SINCE_START}`}
      right={active.window?.suggestedTokens ? (
        <Pill tone="accent">
          {active.label} recommends {fmtTokens(active.window.suggestedTokens)}
        </Pill>
      ) : null}
    >
      <div className="grid gap-0">
        <MetricStrip>
          <StatCell label="Shortlist num_ctx" accent
            value={fmtTokens(shortlist?.suggestedTokens)}
            sub={shortlist?.suggestedTokens
              ? `${fmtTokens(shortlist.peakInputTokens)} peak prompt${shortlist.peakKind ? ` · ${shortlist.peakKind.replace(/^sdk\./, '')}` : ''}`
              : 'waiting for shortlist usage'} />
          <StatCell label="Agentic Picker num_ctx" accent
            value={fmtTokens(agenticPicker?.suggestedTokens)}
            sub={agenticPicker?.suggestedTokens
              ? `${fmtTokens(agenticPicker.peakInputTokens)} peak prompt${agenticPicker.peakKind ? ` · ${agenticPicker.peakKind.replace(/^sdk\./, '')}` : ''}`
              : 'waiting for Agentic usage'} />
          <StatCell label="Headroom"
            value={agenticPicker?.headroomPct != null ? `${agenticPicker.headroomPct}%` : shortlist?.headroomPct != null ? `${shortlist.headroomPct}%` : '—'}
            sub={agenticPicker?.responseReserveTokens != null || shortlist?.responseReserveTokens != null
              ? `${fmtTokens(agenticPicker?.responseReserveTokens ?? shortlist?.responseReserveTokens)} response reserve`
              : 'applied once samples arrive'} />
          <StatCell label="Agentic samples" value={fmtInt(agenticPicker?.samples)} last
            sub="successful calls with input usage" />
        </MetricStrip>
        <div className="border-t border-separator-soft p-3.5">
          <p className="field-hint mb-3 max-w-[760px]">
            Ollama&apos;s num_ctx is one setting for every call, so each route&apos;s figure must hold its own
            picker prompts and every other LLM function running beside it (links, segments, requests). Agentic
            counts its largest individual model step rather than the whole tool loop. Both add headroom and a
            response reserve, then round up for a server context setting. The peak names the function that set it.
          </p>
          <Table<ContextWindowRow>
            empty="No LLM calls recorded yet"
            rows={rows}
            cols={[
              { key: 'kind', label: 'Function', render: r => r.kind.replace(/^sdk\./, '') },
              { key: 'calls', label: 'Calls', align: 'right',
                render: r => <span className="mono-num">{r.calls}</span> },
              { key: 'samples', label: 'Usage', align: 'right',
                render: r => <span className="mono-num">{r.samples}/{r.calls}</span> },
              { key: 'averageInputTokens', label: 'Avg context', align: 'right',
                render: r => <span className="mono-num">{fmtTokens(r.averageInputTokens)}</span> },
              { key: 'peakInputTokens', label: 'Peak', align: 'right',
                render: r => <span className="mono-num">{fmtTokens(r.peakInputTokens)}</span> },
            ]}
          />
          {agenticPicker?.suggestedTokens == null && shortlist?.suggestedTokens == null && (
            <p className="field-hint mt-3 italic">{agenticPicker?.message || shortlist?.message || 'Waiting for context-window evidence.'}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
