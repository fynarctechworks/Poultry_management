'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { colors } from '@/lib/theme/tokens';

interface Point { date: string; broiler: number; egg: number | null; }

export function PriceTrend({ data }: { data: Point[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={colors.mute} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.bodySoft }} />
          <YAxis tick={{ fontSize: 11, fill: colors.bodySoft }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: `1px solid ${colors.mute}`, fontSize: 12 }}
            formatter={(v: any) => `₹${v}`}
          />
          <Line type="monotone" dataKey="broiler" stroke={colors.primary} strokeWidth={2} dot={false} name="Broiler ₹/kg" />
          <Line type="monotone" dataKey="egg" stroke={colors.success} strokeWidth={2} dot={false} name="Egg ₹/100" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
