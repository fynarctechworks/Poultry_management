/** Pure server-rendered SVG sparkline — zero client JS. */
import { colors } from '@/lib/theme/tokens';

interface TrendPoint {
  date: string;
  mrr_inr: number;
  active_count: number;
  trial_count: number;
}

interface SparklineProps {
  trend: TrendPoint[];
}

const WIDTH = 420;
const HEIGHT = 72;
const PAD_X = 4;
const PAD_Y = 8;

export function Sparkline({ trend }: SparklineProps) {
  if (trend.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-[72px] gap-xs">
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full max-w-full"
          aria-hidden="true"
        >
          <line
            x1={PAD_X}
            y1={HEIGHT / 2}
            x2={WIDTH - PAD_X}
            y2={HEIGHT / 2}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            className="text-mute"
          />
        </svg>
        <p className="text-[11px] text-body-soft text-center">
          Trends build as daily snapshots accumulate
        </p>
      </div>
    );
  }

  const values = trend.map((p) => p.mrr_inr);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1; // avoid div-by-zero when all equal

  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;

  const points = trend.map((p, i) => {
    const x = PAD_X + (i / (trend.length - 1)) * innerW;
    const y = PAD_Y + innerH - ((p.mrr_inr - minVal) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(' ');

  // Fill polygon (close path back to bottom)
  const firstX = PAD_X.toFixed(1);
  const lastX = (PAD_X + innerW).toFixed(1);
  const bottomY = (PAD_Y + innerH).toFixed(1);
  const fillPoints =
    `${firstX},${bottomY} ` + polylinePoints + ` ${lastX},${bottomY}`;

  // Last value for the right-edge label
  const lastMrr = trend[trend.length - 1].mrr_inr;
  const firstMrr = trend[0].mrr_inr;
  const isUp = lastMrr >= firstMrr;

  return (
    <div className="flex flex-col gap-xs">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-full"
        aria-label="MRR trend sparkline"
        role="img"
      >
        {/* Fill area */}
        <polygon
          points={fillPoints}
          fill={isUp ? colors.successSoft : colors.warningSoft}
        />
        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={isUp ? colors.success : colors.warning}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* End dot */}
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r={3}
          fill={isUp ? colors.success : colors.warning}
        />
      </svg>

      <div className="flex justify-between text-[10px] text-body-soft tabular-nums px-xs">
        <span>{trend[0].date}</span>
        <span>{trend[trend.length - 1].date}</span>
      </div>
    </div>
  );
}
