'use client';
import { fmtBaht, fmtKwh, fmt2 } from '@/utils/formatters';

/**
 * DailySummary Component
 * สรุปประจำวัน: พลังงาน + ค่าไฟ Peak/Off-Peak
 */
export default function DailySummary({ tou, monthlyCost, lastUpdated }) {
  const peak    = monthlyCost?.peak_cost     ?? 0;
  const offpeak = monthlyCost?.off_peak_cost ?? 0;
  const peakKwh   = monthlyCost?.peak_kwh     ?? 0;
  const offKwh    = monthlyCost?.off_peak_kwh ?? 0;
  const totalKwh  = monthlyCost?.total_kwh    ?? 0;
  const svc       = monthlyCost?.service_charge ?? 312.24;
  const total     = monthlyCost?.total_cost   ?? 0;

  const lastUpdateStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('th-TH', { hour12: false })
    : '—';

  const CELLS = [
    {
      label: 'รายการแยก Peak',
      kwh:   peakKwh,
      cost:  peak,
      color: 'text-orange-400',
      border:'border-orange-500/30',
      bg:    'bg-orange-500/5',
    },
    {
      label: 'รายการ Off-Peak',
      kwh:   offKwh,
      cost:  offpeak,
      color: 'text-indigo-400',
      border:'border-indigo-500/30',
      bg:    'bg-indigo-500/5',
    },
    {
      label: 'ค่าบริการคงที่',
      kwh:   null,
      cost:  svc,
      color: 'text-white/50',
      border:'border-white/10',
      bg:    'bg-white/[0.02]',
    },
    {
      label: 'รวม (Peak + Off-Peak + ค่าบริการ)',
      kwh:   totalKwh,
      cost:  total,
      color: 'text-amber-400',
      border:'border-amber-500/30',
      bg:    'bg-amber-500/5',
      bold:  true,
    },
  ];

  return (
    <div className="shrink-0 flex flex-col gap-2">
      {/* Section Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-bold tracking-[0.3em] text-white/30 uppercase">
          │ สรุปค่าไฟฟ้าสะสมเดือนนี้
        </span>
        <span className="text-[10px] text-white/20 font-mono">
          อัปเดตล่าสุด: {lastUpdateStr}
        </span>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-4 gap-3">
        {CELLS.map((cell) => (
          <div
            key={cell.label}
            className={`rounded-xl border ${cell.border} ${cell.bg}
                        px-4 py-3 flex flex-col gap-1`}
          >
            <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest
                            truncate">
              {cell.label}
            </div>

            <div className={`text-xl font-black tabular-nums ${
              cell.bold ? 'text-2xl' : ''
            } ${cell.color}`}>
              {fmtBaht(cell.cost)}
              <span className="text-xs font-semibold text-white/30 ml-1">บาท</span>
            </div>

            {cell.kwh != null && (
              <div className="text-[11px] text-white/30 font-mono">
                {parseFloat(cell.kwh).toFixed(3)} kWh
              </div>
            )}
          </div>
        ))}
      </div>

      {/* TOU Rate Display */}
      {tou && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] text-white/20 font-semibold tracking-widest uppercase">
            อัตราปัจจุบัน:
          </span>
          <span className={`text-[11px] font-bold px-3 py-0.5 rounded-full border ${
            tou.period === 'peak'
              ? 'text-orange-400 border-orange-500/30 bg-orange-500/10'
              : 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
          }`}>
            {tou.period === 'peak' ? '⚡ PEAK' : '🌙 OFF-PEAK'} — {tou.rate?.toFixed(4)} บาท/kWh
          </span>
          {tou.kwhDelta > 0 && (
            <span className="text-[10px] text-white/20 font-mono">
              +{tou.kwhDelta?.toFixed(5)} kWh ({fmtBaht(tou.costDelta)} บาท) รอบนี้
            </span>
          )}
        </div>
      )}
    </div>
  );
}
