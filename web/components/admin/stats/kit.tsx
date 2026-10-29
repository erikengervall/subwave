'use client';

// The pieces every Stats card is built from: a strip of headline numbers, bar
// lists, tables, and the health dot that marks a number as checked. Colours
// follow the Doctor page: ink for ok, vermilion for worth a look, danger for
// needs attention. The theme has no green, so ok is ink.

import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useDynamicStyle } from '../../../hooks/useDynamicStyle';
import { ScrollArea } from '../../ui/scroll-area';
import { cn } from '../../../lib/cn';
import { HEALTH_LABEL, type Health } from '../../../lib/statsHealth';

const DOT: Record<Health, string> = {
  ok: 'bg-ink opacity-60',
  warn: 'bg-[var(--accent)]',
  bad: 'bg-[var(--danger)] ring-[3px] ring-[color-mix(in_oklab,var(--danger)_22%,transparent)]',
  idle: 'border border-[var(--muted)]',
};

// Decorative: whoever renders a dot also says its meaning in text.
export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', DOT[health], className)}
    />
  );
}

export const healthText = (health: Health | undefined): string =>
  health === 'bad' ? 'text-[var(--danger)]' : health === 'warn' ? 'text-vermilion' : '';

interface StatCellProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  // Marks the number as judged (lib/statsHealth.ts); idle draws nothing.
  health?: Health;
  last?: boolean;
  title?: string;
}

export function StatCell({ label, value, sub, accent, health, last, title }: StatCellProps) {
  const judged = health && health !== 'idle';
  const tone = judged ? healthText(health) : accent ? 'text-vermilion' : '';
  return (
    <div
      title={title}
      className={cn(
        'grid content-start gap-[3px] p-3.5',
        !last && 'border-r border-separator-soft',
      )}
    >
      <span className="caption">{label}</span>
      <span className="flex items-center gap-2">
        {judged && <HealthDot health={health} />}
        {judged && <span className="sr-only">{HEALTH_LABEL[health]}:</span>}
        <span className={cn('mono-num text-[22px] leading-[1.1] font-bold', tone)}>{value}</span>
      </span>
      {sub && <span className="text-[11px] leading-[1.45] text-muted">{sub}</span>}
    </div>
  );
}

export function MetricStrip({ children }: { children: ReactNode }) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : 1;
  const ref = useRef<HTMLDivElement>(null);
  useDynamicStyle(ref, { gridTemplateColumns: `repeat(${count}, 1fr)` });
  // `.strip-mobile` reflows to 2 columns under 640px and clears LEFT rules only;
  // StatCell divides with a RIGHT rule, so clear the row-ending one here.
  return (
    <div
      ref={ref}
      className="strip-mobile grid border-b border-separator-strong [&>*:nth-child(even)]:border-r-0 sm:[&>*:nth-child(even):not(:last-child)]:border-r"
    >
      {children}
    </div>
  );
}

export type BarTone = 'accent' | 'danger' | 'ink';

const BAR_TONE: Record<BarTone, string> = {
  accent: 'bg-vermilion',
  danger: 'bg-[var(--danger)]',
  ink: 'bg-ink opacity-70',
};

export function Bar({ frac, tone = 'accent', className }: { frac?: number; tone?: BarTone; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const clamped = Math.min(1, Math.max(0, frac || 0));
  useDynamicStyle(ref, { width: `${Math.max(2, Math.round(clamped * 100))}%` });
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-[2px] bg-separator-soft', className)}>
      <span ref={ref} className={cn('block h-full', BAR_TONE[tone])} />
    </span>
  );
}

export interface BarRow {
  label: string;
  count: number;
  trailing?: ReactNode;
  title?: string;
}

// One grid for the whole list rather than a flex row each, so every bar shares
// one track width and a long trailing figure cannot shorten its own bar. `max`
// anchors the widest bar to 100%.
export function BarList({ rows, max }: { rows: BarRow[]; max: number }) {
  return (
    <div className="grid grid-cols-[fit-content(6.5rem)_minmax(2.5rem,1fr)_auto] items-center gap-x-3 gap-y-2 text-[12px] sm:grid-cols-[fit-content(11rem)_minmax(3rem,1fr)_auto]">
      {rows.map(r => (
        <BarListRow key={r.label} row={r} max={max} />
      ))}
    </div>
  );
}

function BarListRow({ row, max }: { row: BarRow; max: number }) {
  return (
    <>
      <span className="min-w-0 truncate text-muted" title={row.title ?? row.label}>{row.label}</span>
      <Bar frac={row.count / (max || 1)} />
      <span className="mono-num text-right font-bold whitespace-nowrap">{row.trailing ?? row.count}</span>
    </>
  );
}

export interface TableColumn<R> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right' | 'center';
  render?: (row: R) => ReactNode;
}

export function Table<R>({ cols, rows, empty }: { cols: TableColumn<R>[]; rows?: R[]; empty: ReactNode }) {
  if (!rows?.length) {
    return <span className="field-hint italic">{empty}</span>;
  }
  // Scroll container below sm: only. From sm: up overflow-x must stay `visible`
  // or the sticky <thead> resolves against this div, not the ScrollBox viewport.
  return (
    <div className="w-full overflow-x-auto sm:overflow-x-visible">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {cols.map(c => (
              <th
                key={c.key}
                className={cn(
                  'caption border-b border-separator-strong px-2 py-1 whitespace-nowrap',
                  // Sticky for the ScrollBox case; card-bg masks rows underneath.
                  'sticky top-0 z-[1] bg-[var(--card-bg)]',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td
                  key={c.key}
                  className={cn(
                    'border-b border-separator-soft px-2 py-1.5 text-[12px]',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.render ? c.render(r) : ((r as Record<string, unknown>)[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Caps a long-tail breakdown; the sticky <thead> resolves against this viewport.
export function ScrollBox({ children }: { children: ReactNode }) {
  return <ScrollArea className="max-h-[260px]">{children}</ScrollArea>;
}

// A titled region inside a card, with the rule placement the cards share.
export function Pane({ title, note, children, className }: {
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('p-3.5', className)}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="caption">{title}</span>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className="field-hint italic">{children}</span>;
}
