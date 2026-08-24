'use client';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Area, AreaChart,
} from 'recharts';

const PHASE_COLORS = {
  L1:    '#f59e0b',
  L2:    '#06b6d4',
  L3:    '#10b981',
  total: '#818cf8',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1424] border border-white/10 rounded-xl p-3 shadow-2xl
                    text-xs backdrop-blur-sm">
      <p className="text-white/40 font-semibold mb-2 tracking-wider">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: entry.color }} className="font-semibold">
            {entry.name}:
          </span>
          <span className="text-white font-bold">
            {entry.value?.toLocaleString('th-TH')} W
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RealtimeChartInner({ chartPoints }) {
  const isEmpty = !chartPoints || chartPoints.length === 0;

  if (isEmpty) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
        <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-400
                        rounded-full animate-spin" />
        <p className="text-white/20 text-sm tracking-wider">
          รอข้อมูลจากเซนเซอร์...
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={chartPoints}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <defs>
          {/* Gradient fills */}
          <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PHASE_COLORS.total} stopOpacity={0.3} />
            <stop offset="95%" stopColor={PHASE_COLORS.total} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradL1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PHASE_COLORS.L1} stopOpacity={0.2} />
            <stop offset="95%" stopColor={PHASE_COLORS.L1} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradL2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PHASE_COLORS.L2} stopOpacity={0.2} />
            <stop offset="95%" stopColor={PHASE_COLORS.L2} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradL3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PHASE_COLORS.L3} stopOpacity={0.2} />
            <stop offset="95%" stopColor={PHASE_COLORS.L3} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="4 4"
          stroke="rgba(255,255,255,0.04)"
          horizontal={true}
          vertical={false}
        />

        <XAxis
          dataKey="time"
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          interval={Math.max(0, Math.floor(chartPoints.length / 6) - 1)}
        />

        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
          width={48}
        />

        <Tooltip content={<CustomTooltip />} />

        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          formatter={(value) => (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              {value}
            </span>
          )}
        />

        {/* Total Power — เส้นหลัก */}
        <Area
          type="monotone"
          dataKey="total"
          name="Total (W)"
          stroke={PHASE_COLORS.total}
          strokeWidth={2.5}
          fill="url(#gradTotal)"
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 4, fill: PHASE_COLORS.total, strokeWidth: 0 }}
        />

        {/* L1 */}
        <Area
          type="monotone"
          dataKey="L1"
          name="L1 (W)"
          stroke={PHASE_COLORS.L1}
          strokeWidth={1.5}
          fill="url(#gradL1)"
          dot={false}
          isAnimationActive={false}
          strokeDasharray=""
          activeDot={{ r: 3, fill: PHASE_COLORS.L1, strokeWidth: 0 }}
        />

        {/* L2 */}
        <Area
          type="monotone"
          dataKey="L2"
          name="L2 (W)"
          stroke={PHASE_COLORS.L2}
          strokeWidth={1.5}
          fill="url(#gradL2)"
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 3, fill: PHASE_COLORS.L2, strokeWidth: 0 }}
        />

        {/* L3 */}
        <Area
          type="monotone"
          dataKey="L3"
          name="L3 (W)"
          stroke={PHASE_COLORS.L3}
          strokeWidth={1.5}
          fill="url(#gradL3)"
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 3, fill: PHASE_COLORS.L3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
