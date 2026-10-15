"use client";

import { useEffect, useRef, useState } from "react";
import { PACES, RATINGS, formatSessionDate, type SessionSummary } from "@/lib/shared";

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** Understanding distribution: one series, one hue, value at the bar tip. */
export function RatingBars({ distribution }: { distribution: number[] }) {
  const total = distribution.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...distribution);
  const rows = [...RATINGS].reverse();

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const n = distribution[r.value - 1] ?? 0;
        return (
          <li
            key={r.value}
            className="group grid grid-cols-[6.5rem_1fr] items-center gap-3"
            title={`${r.label}: ${n} ${n === 1 ? "student" : "students"} (${pct(n, total)}%)`}
          >
            <span className="flex items-center gap-1.5 text-sm text-ink-2">
              <span aria-hidden="true" className="text-base">
                {r.emoji}
              </span>
              {r.label}
            </span>
            <span className="flex items-center gap-2">
              {n > 0 && (
                <span
                  className="h-5 rounded-r-[4px] bg-series-1 transition-[width,filter] group-hover:brightness-110"
                  // Scale within the space left after the value label, so length stays proportional.
                  style={{ width: `calc((100% - 5rem) * ${n / max})`, minWidth: 3 }}
                />
              )}
              <span className="shrink-0 text-sm tnum text-ink">
                {n}
                <span className="text-muted"> · {pct(n, total)}%</span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const PACE_COLORS: Record<number, string> = {
  [-1]: "var(--pole-slow)",
  0: "var(--neutral-mid)",
  1: "var(--pole-fast)",
};

/** Pace: a diverging part-to-whole bar (slow ← just right → fast), legend carries the numbers. */
export function PaceBar({ slow, right, fast }: { slow: number; right: number; fast: number }) {
  const counts: Record<number, number> = { [-1]: slow, 0: right, 1: fast };
  const total = slow + right + fast;
  if (!total) return <p className="text-sm text-muted">No pace answers yet.</p>;

  const fastShare = fast / total;
  const slowShare = slow / total;
  const verdict =
    fastShare >= 0.3 && fastShare >= slowShare
      ? `${pct(fast, total)}% found it too fast. Consider slowing down or recapping.`
      : slowShare >= 0.3
        ? `${pct(slow, total)}% found it too slow. You could move faster or add a challenge.`
        : right / total > 0.5
          ? "The pace worked for most of the class."
          : `Mixed: ${pct(fast, total)}% too fast, ${pct(slow, total)}% too slow.`;

  return (
    <div>
      <div className="flex h-6 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`Pace: ${PACES.map((p) => `${p.label} ${counts[p.value]}`).join(", ")}`}>
        {PACES.map((p) =>
          counts[p.value] > 0 ? (
            <div
              key={p.value}
              title={`${p.label}: ${counts[p.value]} (${pct(counts[p.value], total)}%)`}
              className="h-full transition-[filter] hover:brightness-110"
              style={{ flexGrow: counts[p.value], background: PACE_COLORS[p.value] }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {PACES.map((p) => (
          <li key={p.value} className="flex items-center gap-1.5 text-ink-2">
            <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: PACE_COLORS[p.value] }} />
            {p.label}
            <span className="tnum text-ink">{counts[p.value]}</span>
            <span className="tnum text-muted">({pct(counts[p.value], total)}%)</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink">{verdict}</p>
    </div>
  );
}

/** Average understanding per class over time. Single series, so no legend; the table below is its twin. */
export function TrendChart({
  sessions,
  selectedDate,
  onSelect,
}: {
  sessions: SessionSummary[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = sessions.filter((s) => s.avgRating !== null).slice(0, 30).reverse();
  const H = 220;
  const m = { top: 14, right: 16, bottom: 30, left: 30 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = H - m.top - m.bottom;
  const x = (i: number) => m.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => m.top + ((5 - v) / 4) * plotH;

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avgRating!).toFixed(1)}`).join("");
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 90))));

  function nearest(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    return best;
  }

  const hp = hover !== null ? points[hover] : null;

  return (
    <div ref={wrap} className="relative select-none" style={{ height: H }}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          className="block cursor-pointer touch-pan-y"
          onPointerMove={(e) => setHover(nearest(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => onSelect(points[nearest(e.clientX)].date)}
          aria-hidden="true"
        >
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke={v === 1 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={m.left - 10} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {v}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2) || i === points.length - 1 ? (
              <text
                key={p.date}
                x={x(i)}
                y={H - 8}
                // Edge labels hang inward so they're never clipped.
                textAnchor={points.length > 1 && i === 0 ? "start" : points.length > 1 && i === points.length - 1 ? "end" : "middle"}
                fontSize={11}
                fill="var(--muted)"
              >
                {formatSessionDate(p.date).replace(/^\w+, /, "")}
              </text>
            ) : null,
          )}
          {hp && <line x1={x(hover!)} x2={x(hover!)} y1={m.top} y2={m.top + plotH} stroke="var(--line-strong)" strokeWidth={1} />}
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => {
            const selected = p.date === selectedDate;
            return (
              <circle
                key={p.date}
                cx={x(i)}
                cy={y(p.avgRating!)}
                r={selected || hover === i ? 6 : 4}
                fill="var(--series-1)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            );
          })}
        </svg>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(x(hover!) - 70, 0), Math.max(0, width - 140)),
            width: 140,
          }}
        >
          <div className="text-base font-semibold text-ink tnum">{hp.avgRating!.toFixed(1)} / 5</div>
          <div className="text-ink-2">{formatSessionDate(hp.date)}</div>
          <div className="text-muted tnum">
            {hp.responses} {hp.responses === 1 ? "response" : "responses"}
          </div>
        </div>
      )}
    </div>
  );
}
