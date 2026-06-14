/**
 * ActivityTrend — pure server-rendered SVG.
 * 14-day daily event bars with an active_tenants overlay line.
 * Zero client JS.
 */
import { colors } from '@/lib/theme/tokens';

interface TrendPoint {
  date: string;   // "2026-06-14"
  events: number;
  active_tenants: number;
}

interface ActivityTrendProps {
  data: TrendPoint[];
}

const SVG_W = 480;
const SVG_H = 120;
const PAD_L = 32;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

/** Format ISO date → "14 Jun" */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}

export function ActivityTrend({ data }: ActivityTrendProps) {
  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-[120px] text-body-soft gap-xs">
        <p className="text-sm">Not enough data points.</p>
        <p className="text-xs">Activity bars will appear after 2+ days of data.</p>
      </div>
    );
  }

  const innerW = SVG_W - PAD_L - PAD_R;
  const innerH = SVG_H - PAD_T - PAD_B;
  const n = data.length;

  const maxEvents = Math.max(...data.map((d) => d.events), 1);
  const maxTenants = Math.max(...data.map((d) => d.active_tenants), 1);

  const slotW = innerW / n;
  const barW  = Math.max(4, slotW * 0.6);

  // Only show x-axis label for first, middle, and last
  const labelIdxSet = new Set([0, Math.floor(n / 2), n - 1]);

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full max-w-full"
      aria-label="14-day activity trend"
      role="img"
    >
      {/* Y-axis baseline */}
      <line
        x1={PAD_L}
        y1={PAD_T + innerH}
        x2={SVG_W - PAD_R}
        y2={PAD_T + innerH}
        stroke={colors.mute}
        strokeWidth={1}
      />

      {/* Y-axis max label */}
      <text
        x={PAD_L - 4}
        y={PAD_T + 6}
        textAnchor="end"
        fontSize={8}
        fill={colors.bodySoft}
        fontFamily="IBM Plex Sans, sans-serif"
      >
        {maxEvents}
      </text>
      <text
        x={PAD_L - 4}
        y={PAD_T + innerH}
        textAnchor="end"
        fontSize={8}
        fill={colors.bodySoft}
        fontFamily="IBM Plex Sans, sans-serif"
      >
        0
      </text>

      {/* Event bars */}
      {data.map((d, i) => {
        const cx  = PAD_L + slotW * i + slotW / 2;
        const bh  = innerH * (d.events / maxEvents);
        const x   = cx - barW / 2;
        const y   = PAD_T + innerH - bh;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={bh}
              rx={2}
              fill={colors.primary}
              fillOpacity={0.7}
            />
            {/* X-axis label — first, mid, last only */}
            {labelIdxSet.has(i) && (
              <text
                x={cx}
                y={SVG_H - 4}
                textAnchor="middle"
                fontSize={8}
                fill={colors.bodySoft}
                fontFamily="IBM Plex Sans, sans-serif"
              >
                {fmtDate(d.date)}
              </text>
            )}
          </g>
        );
      })}

      {/* Active tenants line overlay */}
      <polyline
        points={data
          .map((d, i) => {
            const cx = PAD_L + slotW * i + slotW / 2;
            const cy = PAD_T + innerH - innerH * (d.active_tenants / maxTenants);
            return `${cx.toFixed(1)},${cy.toFixed(1)}`;
          })
          .join(' ')}
        fill="none"
        stroke={colors.success}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
    </svg>
  );
}
