'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { colors } from '@/lib/theme/tokens';

interface Point { week: number; hdep: number }

export function HdepCurve({ data, peakHdepPct }: { data: Point[]; peakHdepPct?: number | null }) {
  if (data.length === 0) return null;
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={colors.mute} strokeDasharray="3 3" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: colors.bodySoft }}
            label={{ value: 'Weeks since placement', position: 'insideBottom', offset: -2, fontSize: 11, fill: colors.bodySoft }}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: colors.bodySoft }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: `1px solid ${colors.mute}`, fontSize: 12 }}
            formatter={(v: any) => `${v}%`}
            labelFormatter={(w) => `Week ${w}`}
          />
          {peakHdepPct ? (
            <ReferenceLine y={peakHdepPct} stroke={colors.success} strokeDasharray="4 4" />
          ) : null}
          <Line type="monotone" dataKey="hdep" stroke={colors.primary} strokeWidth={2} dot={{ r: 2 }} name="HDEP %" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
