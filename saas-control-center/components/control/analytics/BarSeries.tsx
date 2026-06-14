/**
 * BarSeries — pure server-rendered SVG.
 * Renders monthly signups as bars and cumulative as a line/area overlay.
 * Zero client JS; no chart library.
 */
import { colors } from '@/lib/theme/tokens';

interface GrowthPoint {
  month: string;          // "2026-01"
  signups: number;
  cumulative: number;
}

interface BarSeriesProps {
  data: GrowthPoint[];
}

const SVG_W = 640;
const SVG_H = 160;
const PAD_L = 36;   // left — y-axis labels
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;   // bottom — x-axis labels

/** Format "2026-01" → "Jan '26" */
function fmtMonth(ym: string): string {
  try {
    const [y, m] = ym.split('-').map(Number);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[(m ?? 1) - 1]} '${String(y ?? 0).slice(2)}`;
  } catch {
    return ym;
  }
}

export function BarSeries({ data }: BarSeriesProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[160px] gap-xs text-body-soft">
        <p className="text-sm">No growth data yet.</p>
        <p className="text-xs">Monthly signup bars will appear as tenants join.</p>
      </div>
    );
  }

  const innerW = SVG_W - PAD_L - PAD_R;
  const innerH = SVG_H - PAD_T - PAD_B;

  const maxSignups = Math.max(...data.map((d) => d.signups), 1);
  const maxCumul   = Math.max(...data.map((d) => d.cumulative), 1);

  const n = data.length;
  const slotW = innerW / n;
  const barW  = Math.max(6, slotW * 0.55);

  // Bar rects
  const bars = data.map((d, i) => {
    const cx   = PAD_L + slotW * i + slotW / 2;
    const bh   = innerH * (d.signups / maxSignups);
    const x    = cx - barW / 2;
    const y    = PAD_T + innerH - bh;
    return { x, y, w: barW, h: bh, label: fmtMonth(d.month), signups: d.signups };
  });

  // Cumulative line points (scaled independently)
  const linePoints = data.map((d, i) => {
    const cx = PAD_L + slotW * i + slotW / 2;
    const cy = PAD_T + innerH - innerH * (d.cumulative / maxCumul);
    return `${cx.toFixed(1)},${cy.toFixed(1)}`;
  });

  // Fill polygon for cumulative area (close to bottom)
  const firstCx = (PAD_L + slotW / 2).toFixed(1);
  const lastCx  = (PAD_L + slotW * (n - 1) + slotW / 2).toFixed(1);
  const bottomY = (PAD_T + innerH).toFixed(1);
  const fillPoly = `${firstCx},${bottomY} ${linePoints.join(' ')} ${lastCx},${bottomY}`;

  // Y-axis ticks (3 labels: 0, mid, max)
  const yTicks = [0, Math.round(maxSignups / 2), maxSignups];

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full max-w-full"
      aria-label="Monthly signup bars with cumulative line"
      role="img"
    >
      {/* Y-axis ticks + grid lines */}
      {yTicks.map((v) => {
        const cy = PAD_T + innerH - innerH * (v / maxSignups);
        return (
          <g key={v}>
            <line
              x1={PAD_L}
              y1={cy}
              x2={SVG_W - PAD_R}
              y2={cy}
              stroke={colors.mute}
              strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : '3 3'}
            />
            <text
              x={PAD_L - 4}
              y={cy + 4}
              textAnchor="end"
              fontSize={9}
              fill={colors.bodySoft}
              fontFamily="IBM Plex Sans, sans-serif"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Cumulative area fill */}
      <polygon
        points={fillPoly}
        fill={colors.primarySubtle}
      />

      {/* Bars */}
      {bars.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={3}
            fill={colors.primary}
            fillOpacity={0.85}
          />
          {/* Signup count label above bar (only if tall enough) */}
          {b.h > 14 && (
            <text
              x={b.x + b.w / 2}
              y={b.y - 3}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={colors.primary}
              fontFamily="IBM Plex Sans, sans-serif"
            >
              {b.signups}
            </text>
          )}
          {/* X-axis month label */}
          <text
            x={b.x + b.w / 2}
            y={SVG_H - 4}
            textAnchor="middle"
            fontSize={9}
            fill={colors.bodySoft}
            fontFamily="IBM Plex Sans, sans-serif"
          >
            {b.label}
          </text>
        </g>
      ))}

      {/* Cumulative line */}
      <polyline
        points={linePoints.join(' ')}
        fill="none"
        stroke={colors.primaryDark}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* End dot */}
      {linePoints.length > 0 && (() => {
        const last = linePoints[linePoints.length - 1].split(',');
        return (
          <circle
            cx={last[0]}
            cy={last[1]}
            r={3.5}
            fill={colors.primaryDark}
          />
        );
      })()}
    </svg>
  );
}
