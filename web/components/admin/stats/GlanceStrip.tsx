'use client';

// The four answers an operator opens Stats for, above the tabs: is anyone
// listening, how many came by, is the DJ healthy, and how much of today's token
// allowance is gone. Each tile names its own window, because the reads behind
// them cover different spans.

import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { HEALTH_LABEL, type Health } from '../../../lib/statsHealth';
import type { ListenerSample } from '../../../lib/audienceStats';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, HealthDot, healthText } from './kit';
import { Sparkline } from './charts';
import { fmtInt, fmtTokens } from './format';
import type { LlmStats } from './types';

function Tile({ label, children, sub, extra }: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 bg-[var(--card-bg)] p-4">
      <span className="caption">{label}</span>
      <div className="flex min-h-[38px] items-center gap-2.5">{children}</div>
      {extra}
      {sub && <span className="text-[11px] leading-[1.45] text-muted">{sub}</span>}
    </div>
  );
}

const BIG = 'mono-num text-[32px] leading-none font-extrabold tracking-[-0.02em]';

export interface GlanceStripProps {
  listenersNow: number | null;
  peak: number | null;
  samples: ListenerSample[];
  rangeLabel: string;
  listenersLoaded: boolean;
  visits: number | null;
  countries: number;
  // Null until /stats has answered.
  dj: { health: Health; notes: string[] } | null;
  budget: LlmStats['budget'] | null;
  // /stats failed: the two tiles it feeds say so instead of loading forever.
  statsDown: boolean;
}

export function GlanceStrip({
  listenersNow, peak, samples, rangeLabel, listenersLoaded, visits, countries, dj, budget, statsDown,
}: GlanceStripProps) {
  const pending = statsDown
    ? <span className={cn(BIG, 'text-muted')}>—</span>
    : null;
  const capped = !!budget?.enabled && budget.cap > 0;
  const budgetTone = budget?.mode === 'hard' ? 'danger' : budget?.mode === 'soft' ? 'accent' : 'ink';
  return (
    // gap-px over a rule-coloured ground draws the dividers, so they follow the
    // grid when it wraps to two columns. The tab bar below draws the closing rule.
    <div className="grid grid-cols-2 gap-px bg-[var(--separator-strong)] lg:grid-cols-4">
      <Tile
        label="Listening now"
        sub={peak != null ? `peak ${fmtInt(peak)} in the last ${rangeLabel}` : `last ${rangeLabel}`}
        extra={<Sparkline samples={samples} className="mt-1" />}
      >
        {listenersLoaded ? (
          <span className={cn(BIG, 'text-vermilion')}>{fmtInt(listenersNow)}</span>
        ) : (
          <Skeleton className="h-7 w-10" />
        )}
      </Tile>

      <Tile
        label="Player visits"
        sub={visits ? `from ${fmtInt(countries)} ${countries === 1 ? 'country' : 'countries'} · last ${rangeLabel}` : `player page loads · last ${rangeLabel}`}
      >
        {visits == null ? <Skeleton className="h-7 w-14" /> : <span className={BIG}>{fmtInt(visits)}</span>}
      </Tile>

      <Tile
        label="DJ health"
        sub={dj
          ? dj.notes.slice(0, 2).join(' · ')
          : statsDown ? 'cannot reach the controller' : 'checking the model, voice and requests'}
      >
        {dj ? (
          <>
            <HealthDot health={dj.health} className="size-3" />
            <span className={cn('text-[20px] leading-tight font-extrabold tracking-[-0.01em]', healthText(dj.health))}>
              {HEALTH_LABEL[dj.health]}
            </span>
          </>
        ) : (
          pending ?? <Skeleton className="h-6 w-24" />
        )}
      </Tile>

      <Tile
        label="Tokens today"
        sub={budget
          ? `${capped ? `of ${fmtTokens(budget.cap)} daily cap` : 'no daily cap set'} · resets 00:00 UTC`
          : 'resets 00:00 UTC'}
        extra={capped && budget
          ? <Bar frac={budget.usedToday / budget.cap} tone={budgetTone} className="mt-1 h-2" />
          : null}
      >
        {budget ? (
          <span className={cn(BIG, budget.mode === 'hard' ? 'text-[var(--danger)]' : budget.mode === 'soft' ? 'text-vermilion' : '')}>
            {fmtTokens(budget.usedToday)}
          </span>
        ) : (
          pending ?? <Skeleton className="h-7 w-16" />
        )}
      </Tile>
    </div>
  );
}
