'use client';

import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { colors } from '@/lib/theme/tokens';

interface Props {
  data: { value: number }[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = colors.primary, height = 28 }: Props) {
  if (data.length === 0) return <span className="text-body-soft text-xs">—</span>;
  return (
    <div style={{ width: 80, height }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
