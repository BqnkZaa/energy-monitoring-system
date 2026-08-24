'use client';
import { fmt2, fmt1, fmt0, fmtKwh } from '@/utils/formatters';

/**
 * MainMetrics Component
 * แสดงค่า Metrics รวมของทั้งระบบ 4 ช่อง
 */
const METRICS = [
  {
    key: 'totalW',
    label: 'กำลังไฟรวม',
    unit: 'kW',
    icon: '⚡',
    gradient: 'from-cyan-500/20 to-cyan-600/5',
    border: 'border-cyan-500/30',
    glow: 'shadow-cyan-500/20',
    textColor: 'text-cyan-300',
  },
  {
    key: 'totalA',
    label: 'กระแสเฉลี่ย',
    unit: 'A',
    icon: '〜',
    gradient: 'from-violet-500/20 to-violet-600/5',
    border: 'border-violet-500/30',
    glow: 'shadow-violet-500/20',
    textColor: 'text-violet-300',
  },
  {
    key: 'avgHz',
    label: 'ความถี่เฉลี่ย',
    unit: 'Hz',
    icon: '≋',
    gradient: 'from-sky-500/20 to-sky-600/5',
    border: 'border-sky-500/30',
    glow: 'shadow-sky-500/20',
    textColor: 'text-sky-300',
  },
  {
    key: 'totalKwh',
    label: 'พลังงานสะสมรวม',
    unit: 'kWh',
    icon: '◎',
    gradient: 'from-emerald-500/20 to-emerald-600/5',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
    textColor: 'text-emerald-300',
  },
];

function computeMetrics(data) {
  if (!data?.phases) {
    return { totalW: null, totalA: null, avgHz: null, totalKwh: null };
  }
  const p = data.phases;
  const phases = [p.L1, p.L2, p.L3].filter(Boolean);
  const avgHz = phases.length
    ? phases.reduce((s, x) => s + (parseFloat(x.hz) || 0), 0) / phases.length
    : 0;
  const totalA = phases.reduce((s, x) => s + (parseFloat(x.a) || 0), 0);
  const totalW   = parseFloat(data.total?.w)   || 0;
  const totalKwh = parseFloat(data.total?.kwh) || 0;
  return {
    totalW:   (totalW / 1000).toFixed(3),
    totalA:   totalA.toFixed(2),
    avgHz:    avgHz.toFixed(2),
    totalKwh: totalKwh.toFixed(3),
  };
}

export default function MainMetrics({ data }) {
  const metrics = computeMetrics(data);

  return (
    <div className="grid grid-cols-4 gap-3 shrink-0">
      {METRICS.map((m) => (
        <div
          key={m.key}
          className={`relative rounded-2xl border ${m.border} bg-gradient-to-br ${m.gradient}
                      px-5 py-3 flex flex-col justify-between
                      shadow-lg ${m.glow} overflow-hidden
                      transition-all duration-500`}
        >
          {/* Subtle corner decoration */}
          <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full
                          bg-white/[0.02] blur-xl" />

          <div className="flex items-center justify-between mb-1">
            <span className="text-white/30 text-xs font-semibold tracking-widest uppercase">
              {m.label}
            </span>
            <span className="text-lg opacity-40">{m.icon}</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tabular-nums tracking-tight ${m.textColor}
                             drop-shadow-[0_0_12px_currentColor]`}>
              {metrics[m.key] ?? '—'}
            </span>
            <span className="text-sm font-semibold text-white/30">{m.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
