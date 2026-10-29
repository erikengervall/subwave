'use client';

// Hand-rolled SVG charts for the Audience tab and the glance strip. Each viewBox
// is a fixed 100×100 unit box stretched to its container
// (preserveAspectRatio=none), so strokes carry vector-effect=non-scaling-stroke
// and every word a reader needs (axis labels, the hover reading) is HTML beside
// the drawing, positioned by percentage.

import type { PointerEvent, ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useDynamicStyle } from '../../../hooks/useDynamicStyle';
import { cn } from '../../../lib/cn';
import {
  fmtSampleTime,
  isLongSpan,
  nearestIndex,
  peakSample,
  splitAtGaps,
  timedSamples,
  timeTicks,
  type HourBucket,
  type ListenerSample,
  type TimedCount,
} from '../../../lib/audienceStats';

// 12% headroom so the dashed peak line is not flush against the frame.
const HEADROOM = 1.12;

interface Geometry {
  series: TimedCount[];
  t0: number;
  span: number;
  peak: TimedCount | null;
  lines: string[];
  areas: string[];
}

function geometry(samples: ListenerSample[]): Geometry {
  const series = timedSamples(samples);
  const t0 = series[0]?.ms ?? 0;
  const span = Math.max(1, (series[series.length - 1]?.ms ?? 0) - t0);
  const peak = peakSample(series);
  const drawMax = peak && peak.count > 0 ? peak.count * HEADROOM : 1;
  const x = (ms: number) => (((ms - t0) / span) * 100).toFixed(2);
  const y = (c: number) => (100 - (c / drawMax) * 100).toFixed(2);
  const lines: string[] = [];
  const areas: string[] = [];
  for (const run of splitAtGaps(series)) {
    const first = run[0];
    const last = run[run.length - 1];
    if (!first || !last) continue;
    // A lone minute between two gaps still gets a sliver, not nothing.
    const pts = run.length > 1 ? run : [first, { ...first, ms: first.ms + 60_000 }];
    const line = `M ${pts.map(p => `${x(p.ms)},${y(p.count)}`).join(' L ')}`;
    lines.push(line);
    areas.push(`${line} L ${x(pts[pts.length - 1]?.ms ?? last.ms)},100 L ${x(first.ms)},100 Z`);
  }
  return { series, t0, span, peak, lines, areas };
}

// An HTML overlay placed by percentage of the chart box.
function At({ left, top, className, children }: {
  left?: number;
  top?: number;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useDynamicStyle(ref, {
    left: left == null ? null : `${left}%`,
    top: top == null ? null : `${top}%`,
  });
  return <span ref={ref} className={cn('pointer-events-none absolute', className)}>{children}</span>;
}

export function ListenerChart({ samples }: { samples: ListenerSample[] }) {
  const g = useMemo(() => geometry(samples), [samples]);
  const ticks = useMemo(() => timeTicks(g.t0, g.t0 + g.span), [g]);
  const [hover, setHover] = useState<number | null>(null);

  if (g.series.length < 2) {
    return (
      <div className="flex h-[150px] items-center justify-center">
        <span className="field-hint italic">collecting listener history…</span>
      </div>
    );
  }

  const long = isLongSpan(g.span);
  const peakCount = g.peak?.count ?? 0;
  const drawMax = peakCount > 0 ? peakCount * HEADROOM : 1;
  const xPct = (ms: number) => ((ms - g.t0) / g.span) * 100;
  const yPct = (c: number) => 100 - (c / drawMax) * 100;
  const point = hover != null ? g.series[hover] : undefined;

  const read = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(nearestIndex(g.series, g.t0 + frac * g.span));
  };

  return (
    <div>
      <div className="mb-1.5 flex h-4 items-center justify-end text-[11px] text-muted" aria-live="polite">
        {point ? (
          <span>
            <span className="mono-num font-bold text-ink">{point.count}</span> listening at{' '}
            <span className="mono-num">{fmtSampleTime(point.ms, long)}</span>
          </span>
        ) : (
          <span>point at the chart for a reading</span>
        )}
      </div>
      <div
        className="relative h-[150px] touch-pan-y"
        role="img"
        aria-label={`Listeners over time, peaking at ${peakCount}`}
        onPointerMove={read}
        onPointerDown={read}
        // A finger lifting fires pointerleave; keep its reading on screen.
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}
      >
        <svg className="block h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map(t => (
            <line
              key={t.ms}
              x1={t.frac * 100}
              x2={t.frac * 100}
              y1={0}
              y2={100}
              stroke="var(--separator-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {peakCount > 0 && (
            <line
              x1="0"
              y1={yPct(peakCount)}
              x2="100"
              y2={yPct(peakCount)}
              stroke="var(--accent-2)"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.55}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {g.areas.map((d, i) => (
            <path key={`a${i}`} d={d} fill="color-mix(in oklab, var(--accent) 14%, transparent)" stroke="none" />
          ))}
          {g.lines.map((d, i) => (
            <path
              key={`l${i}`}
              d={d}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {peakCount > 0 && (
          <At top={yPct(peakCount)} className="right-0 -translate-y-full pb-0.5 text-[10px] text-muted">
            peak {peakCount}
          </At>
        )}
        {point && (
          <>
            <At left={xPct(point.ms)} className="inset-y-0 w-px -translate-x-1/2 bg-ink opacity-40" />
            <At
              left={xPct(point.ms)}
              top={yPct(point.count)}
              className="size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--card-bg)]"
            />
          </>
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted" aria-hidden="true">
        {ticks.map(t => (
          <At key={t.ms} left={t.frac * 100} className="mono-num -translate-x-1/2 whitespace-nowrap">
            {t.label}
          </At>
        ))}
      </div>
    </div>
  );
}

// The glance strip's thumbnail of the same series: shape only, no axes.
export function Sparkline({ samples, className }: { samples: ListenerSample[]; className?: string }) {
  const g = useMemo(() => geometry(samples), [samples]);
  if (g.series.length < 2) return <div className={cn('h-8', className)} />;
  return (
    <svg
      className={cn('block h-8 w-full', className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {g.areas.map((d, i) => (
        <path key={`a${i}`} d={d} fill="color-mix(in oklab, var(--accent) 12%, transparent)" stroke="none" />
      ))}
      {g.lines.map((d, i) => (
        <path
          key={`l${i}`}
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

// Per-hour height goes through useDynamicStyle; the lint rule forbids `style={…}`.
function HourColumn({ frac, title, busiest }: { frac: number; title: string; busiest: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useDynamicStyle(ref, { height: `${Math.max(2, Math.round(frac * 100))}%` });
  return (
    <span className="flex h-full flex-1 items-end" title={title}>
      <span
        ref={ref}
        className={cn('block min-h-[2px] w-full rounded-[2px] bg-vermilion', !busiest && 'opacity-35')}
      />
    </span>
  );
}

const pad = (h: number) => String(h).padStart(2, '0');

// The hour whose average is highest, or null with no data. Exported for the
// card caption, which names it.
export function busiestHour(buckets: HourBucket[]): HourBucket | null {
  let best: HourBucket | null = null;
  for (const b of buckets) {
    if (b.samples > 0 && b.avg > 0 && (!best || b.avg > best.avg)) best = b;
  }
  return best;
}

// Average listeners by local hour-of-day, anchored to the busiest hour, which is
// drawn at full strength so the eye lands on it. The axis labels a few anchor
// hours rather than all 24 to stay legible.
export function HourOfDayChart({ buckets }: { buckets: HourBucket[] }) {
  const hasData = buckets.some(b => b.samples > 0);
  if (!hasData) {
    return (
      <div className="flex h-[110px] items-center justify-center">
        <span className="field-hint italic">collecting hourly history…</span>
      </div>
    );
  }
  const top = busiestHour(buckets);
  const maxAvg = top?.avg ?? 0;
  return (
    <div>
      <div className="flex h-[110px] items-end gap-[3px]">
        {buckets.map(b => (
          <HourColumn
            key={b.hour}
            busiest={b.hour === top?.hour}
            frac={maxAvg ? b.avg / maxAvg : 0}
            title={
              b.samples
                ? `${pad(b.hour)}:00 · avg ${Math.round(b.avg * 10) / 10} · peak ${b.peak}`
                : `${pad(b.hour)}:00 · no data`
            }
          />
        ))}
      </div>
      <div className="caption mt-1 flex justify-between text-muted">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

export const fmtHour = (h: number) => `${pad(h)}:00`;
