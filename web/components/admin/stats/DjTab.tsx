'use client';

// How the DJ's machinery is doing: model calls, the voice, and the booth log.
// All three are in-memory rings on the controller, so each card says it counts
// from the last restart.

import { Card, Pill } from '../ui';
import { cn } from '../../../lib/cn';
import { humanKind } from '../../../lib/statsLabels';
import {
  budgetHealth,
  llmHealth,
  voiceFailureHealth,
  voiceFallbackHealth,
} from '../../../lib/statsHealth';
import { BarList, Hint, MetricStrip, Pane, ScrollBox, StatCell, Table } from './kit';
import { SINCE_START, fmtInt, fmtMs, fmtPct, fmtTokens } from './format';
import type { ByEngineRow, ByKindRow, ByModelRow, ByTtsKindRow, DjLogStats, LlmStats, TtsStats } from './types';

const kindCell = (kind: string) => <span title={kind}>{humanKind(kind)}</span>;
const num = (n: number | string) => <span className="mono-num">{n}</span>;

export function DjTab({ llm, tts, djLog }: { llm: LlmStats; tts: TtsStats; djLog: DjLogStats }) {
  return (
    <div className="grid gap-4">
      <ModelCard llm={llm} />
      <VoiceCard tts={tts} />
      <Card title="What the DJ did" sub={`${fmtInt(djLog.count)} recent booth-log events by kind · ${SINCE_START}`}>
        {!djLog.byKind.length ? (
          <Hint>no DJ-log events yet</Hint>
        ) : (
          <ScrollBox>
            <BarList
              max={djLog.byKind[0]?.count || 1}
              rows={djLog.byKind.map(r => ({ label: humanKind(r.kind), count: r.count, title: r.kind }))}
            />
          </ScrollBox>
        )}
      </Card>
    </div>
  );
}

function ModelCard({ llm }: { llm: LlmStats }) {
  const health = llmHealth(llm);
  const budget = llm.budget;
  const budgetSignal = budgetHealth(budget);
  return (
    <Card
      title="Language model"
      sub={`every call the DJ makes: picking tracks, writing links, answering requests · last ${llm.window} calls, ${SINCE_START}`}
      right={
        (llm.provider || llm.activeModel) ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {llm.provider && <Pill>{llm.provider}</Pill>}
            {llm.activeModel && <Pill tone="accent">{llm.activeModel}</Pill>}
          </span>
        ) : null
      }
    >
      {budget?.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-strong p-3.5">
          <span className="text-[12px]">
            <span className="caption">Daily token budget</span>
            <span className="text-muted"> · {budgetSignal.note} · resets 00:00 UTC</span>
          </span>
          <span className="flex items-center gap-2.5">
            <span className={cn(
              'mono-num text-[15px] font-bold',
              budget.mode === 'hard' ? 'text-[var(--danger)]' : budget.mode === 'soft' ? 'text-vermilion' : '',
            )}>
              {fmtTokens(budget.usedToday)} / {fmtTokens(budget.cap)}
            </span>
            <Pill tone={budget.mode === 'normal' ? undefined : 'accent'}>{budget.mode}</Pill>
          </span>
        </div>
      )}
      {llm.count === 0 ? (
        <Hint>no model calls recorded yet</Hint>
      ) : (
        <div className="grid gap-0">
          <MetricStrip>
            <StatCell label="Calls" value={fmtInt(llm.count)} sub={`${llm.ok} ok · ${llm.failed} failed`} />
            <StatCell label="Success rate" value={fmtPct(llm.successRate)} health={health.health} sub={health.note} />
            <StatCell
              label="Typical reply"
              value={fmtMs(llm.latency.p50)}
              sub={`average ${fmtMs(llm.latency.avg)} · 95% within ${fmtMs(llm.latency.p95)}`}
            />
            <StatCell
              label="Tokens"
              value={fmtTokens(llm.tokens?.total)}
              sub={llm.tokens
                ? `${fmtTokens(llm.tokens.input)} read · ${fmtTokens(llm.tokens.output)} written`
                : 'the provider reports none'}
            />
            <StatCell
              label="Agentic picks"
              value={fmtInt(llm.agent.calls)}
              last
              sub={llm.agent.calls
                ? `${llm.agent.avgSteps} steps and ${llm.agent.avgTools} tool calls each, on average`
                : 'none'}
            />
          </MetricStrip>

          <div className="stack-mobile grid grid-cols-[1fr_1fr] gap-0">
            <Pane title="What it was asked to do" className="border-b border-separator-soft sm:border-r sm:border-b-0">
              <Table<ByKindRow>
                empty="No calls"
                rows={llm.byKind}
                cols={[
                  { key: 'kind', label: 'Task', render: r => kindCell(r.kind) },
                  { key: 'count', label: 'Calls', align: 'right', render: r => num(r.count) },
                  {
                    key: 'ok', label: 'OK', align: 'right',
                    render: r => (
                      <span className={cn('mono-num', r.ok < r.count && 'text-vermilion')}>{r.ok}/{r.count}</span>
                    ),
                  },
                  { key: 'avgMs', label: 'Avg', align: 'right', render: r => num(fmtMs(r.avgMs)) },
                  { key: 'tokens', label: 'Tokens', align: 'right', render: r => num(fmtTokens(r.tokens || null)) },
                ]}
              />
            </Pane>
            <Pane title="Models used">
              <Table<ByModelRow>
                empty="No calls"
                rows={llm.byModel}
                cols={[
                  { key: 'model', label: 'Model' },
                  { key: 'count', label: 'Calls', align: 'right', render: r => num(r.count) },
                  { key: 'tokens', label: 'Tokens', align: 'right', render: r => num(fmtTokens(r.tokens || null)) },
                ]}
              />
            </Pane>
          </div>
        </div>
      )}
    </Card>
  );
}

function VoiceCard({ tts }: { tts: TtsStats }) {
  const failure = voiceFailureHealth(tts);
  const fallback = voiceFallbackHealth(tts);
  return (
    <Card title="Voice" sub={`every line the DJ spoke · last ${tts.window} lines, ${SINCE_START}`}>
      {tts.count === 0 ? (
        <Hint>no spoken lines recorded yet</Hint>
      ) : (
        <div className="grid gap-0">
          <MetricStrip>
            <StatCell
              label="Lines spoken"
              value={fmtInt(tts.count)}
              health={failure.health}
              sub={`${tts.ok} ok · ${tts.failed} failed to render`}
            />
            <StatCell
              label="Avg render"
              value={fmtMs(tts.latency.avg)}
              sub={`95% within ${fmtMs(tts.latency.p95)}`}
            />
            <StatCell label="Slowest" value={fmtMs(tts.latency.max)} sub="longest single render" />
            <StatCell
              label="Backup voice"
              value={fmtInt(tts.fellBack)}
              health={fallback.health}
              sub={`${fmtPct(tts.fallbackRate)} of lines, when the main voice failed`}
            />
            <StatCell label="Characters" value={fmtTokens(tts.chars)} last sub="spoken" />
          </MetricStrip>

          <div className="stack-mobile grid grid-cols-[1fr_1fr] gap-0">
            <Pane title="By voice engine" className="border-b border-separator-soft sm:border-r sm:border-b-0">
              <Table<ByEngineRow>
                empty="No lines"
                rows={tts.byEngine}
                cols={[
                  { key: 'engine', label: 'Engine' },
                  { key: 'count', label: 'Lines', align: 'right', render: r => num(r.count) },
                  {
                    key: 'ok', label: 'OK', align: 'right',
                    render: r => (
                      <span className={cn('mono-num', r.ok < r.count && 'text-vermilion')}>{r.ok}/{r.count}</span>
                    ),
                  },
                  { key: 'avgMs', label: 'Avg', align: 'right', render: r => num(fmtMs(r.avgMs)) },
                ]}
              />
            </Pane>
            <Pane title="By kind of line">
              <Table<ByTtsKindRow>
                empty="No lines"
                rows={tts.byKind}
                cols={[
                  { key: 'kind', label: 'Kind', render: r => kindCell(r.kind) },
                  { key: 'count', label: 'Lines', align: 'right', render: r => num(r.count) },
                  { key: 'avgMs', label: 'Avg', align: 'right', render: r => num(fmtMs(r.avgMs)) },
                ]}
              />
            </Pane>
          </div>
        </div>
      )}
    </Card>
  );
}
