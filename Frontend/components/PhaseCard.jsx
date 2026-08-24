'use client';
import { fmt2, fmt1, fmtPF } from '@/utils/formatters';

/**
 * PhaseCard Component
 * แสดงค่าไฟฟ้าของ 1 เฟส (L1 / L2 / L3)
 */
const PHASE_CONFIG = {
  L1: {
    label: 'L1 เฟส 1',
    color:  '#f59e0b',
    border: 'border-amber-500/40',
    bg:     'from-amber-500/10 to-amber-600/5',
    badge:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
    glow:   'shadow-amber-500/10',
    dot:    'bg-amber-400',
  },
  L2: {
    label: 'L2 เฟส 2',
    color:  '#06b6d4',
    border: 'border-cyan-500/40',
    bg:     'from-cyan-500/10 to-cyan-600/5',
    badge:  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    glow:   'shadow-cyan-500/10',
    dot:    'bg-cyan-400',
  },
  L3: {
    label: 'L3 เฟส 3',
    color:  '#10b981',
    border: 'border-emerald-500/40',
    bg:     'from-emerald-500/10 to-emerald-600/5',
    badge:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    glow:   'shadow-emerald-500/10',
    dot:    'bg-emerald-400',
  },
};

function MiniBar({ value, max, color }) {
  const pct = Math.min(100, (parseFloat(value) / max) * 100) || 0;
  return (
    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function PhaseCard({ phase, phaseData }) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG.L1;
  const isValid = phaseData?.valid !== false;

  const v   = phaseData?.v   ?? null;
  const a   = phaseData?.a   ?? null;
  const w   = phaseData?.w   ?? null;
  const pf  = phaseData?.pf  ?? null;
  const hz  = phaseData?.hz  ?? null;
  const kwh = phaseData?.kwh ?? null;

  return (
    <div
      className={`relative rounded-2xl border ${cfg.border}
                  bg-gradient-to-br ${cfg.bg}
                  p-4 shadow-lg ${cfg.glow}
                  flex flex-col gap-2 overflow-hidden
                  ${ !isValid ? 'opacity-50' : '' }`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}
                           ${ isValid ? 'animate-pulse' : '' }`} />
          <span className="text-sm font-bold text-white/80 tracking-wide">{cfg.label}</span>
        </div>
        { !isValid && (
          <span className="text-[10px] font-bold text-red-400 bg-red-500/10
                           border border-red-500/30 px-2 py-0.5 rounded-full">
            ERROR
          </span>
        )}
      </div>

      {/* Voltage — ตัวใหญ่ที่สุด */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-black tabular-nums tracking-tight"
              style={{ color: cfg.color, textShadow: `0 0 20px ${cfg.color}80` }}>
          {fmt2(v)}
        </span>
        <span className="text-base font-semibold text-white/30">V</span>
      </div>

      {/* Mini Bar — Current */}
      <div className="space-y-1">
        <MiniBar value={a} max={30} color={cfg.color} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {/* Current */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/30 font-semibold uppercase tracking-widest">
            กระแส
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums text-white/90">{fmt2(a)}</span>
            <span className="text-xs text-white/30">A</span>
          </div>
        </div>

        {/* Power */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/30 font-semibold uppercase tracking-widest">
            กำลังไฟ
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums text-white/90">
              {w != null ? (parseFloat(w) / 1000).toFixed(3) : '—'}
            </span>
            <span className="text-xs text-white/30">kW</span>
          </div>
        </div>

        {/* PF */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/30 font-semibold uppercase tracking-widest">
            Power Factor
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums text-white/90">{fmtPF(pf)}</span>
          </div>
        </div>

        {/* Hz */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/30 font-semibold uppercase tracking-widest">
            ความถี่
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums text-white/90">{fmt1(hz)}</span>
            <span className="text-xs text-white/30">Hz</span>
          </div>
        </div>
      </div>

      {/* kWh สะสม */}
      <div className="border-t border-white/[0.06] pt-2 flex justify-between items-center">
        <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">
          พลังงานสะสม
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold tabular-nums"
                style={{ color: cfg.color }}>
            {kwh != null ? parseFloat(kwh).toFixed(3) : '—'}
          </span>
          <span className="text-xs text-white/30">kWh</span>
        </div>
      </div>
    </div>
  );
}
