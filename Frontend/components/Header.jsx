'use client';
import { useState, useEffect } from 'react';
import { fmtBaht } from '@/utils/formatters';

/**
 * Header Component
 * - ชื่อระบบ
 * - นาฬิกาดิจิตอล Real-Time
 * - ยอดค่าไฟรวม (ตัวเลขใหญ่สีทอง)
 * - สถานะ Connection
 */
export default function Header({ monthlyCost, connectionStatus, touPeriod }) {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('th-TH', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }));
      setDate(now.toLocaleDateString('th-TH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const totalCost   = monthlyCost?.total_cost  ?? 0;
  const serviceCharge = monthlyCost?.service_charge ?? 312.24;

  const statusConfig = {
    connected:    { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-400', label: 'ONLINE' },
    connecting:   { dot: 'bg-amber-400 animate-pulse',  text: 'text-amber-400',  label: 'กำลังเชื่อมต่อ' },
    disconnected: { dot: 'bg-red-500',                  text: 'text-red-400',    label: 'OFFLINE' },
  };
  const sc = statusConfig[connectionStatus] || statusConfig.connecting;

  const touColors = { peak: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
                      off_peak: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10' };
  const touLabel  = touPeriod === 'peak' ? '⚡ PEAK HOUR' : '🌙 OFF-PEAK';
  const touClass  = touColors[touPeriod] || touColors.off_peak;

  return (
    <header className="flex items-center justify-between px-6 h-[76px] shrink-0
                       border-b border-white/[0.06] bg-[#080c17]/80 backdrop-blur-sm
                       relative z-10">
      {/* ─── LEFT: ชื่อระบบ ─── */}
      <div className="flex items-center gap-4">
        {/* Logo / Icon */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600
                        flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <div className="text-[10px] font-semibold tracking-[0.3em] text-cyan-400/70 uppercase">
            Real-Time Energy Monitoring System
          </div>
          <div className="text-white font-bold text-sm tracking-wide leading-tight">
            ระบบตรวจวัดพลังงานไฟฟ้า 3 เฟส
          </div>
        </div>
      </div>

      {/* ─── CENTER: ค่าไฟรวมสะสม ─── */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase mb-0.5">
          ค่าไฟฟ้าสะสม (เดือนนี้)
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight
                           bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500
                           bg-clip-text text-transparent
                           drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]">
            {fmtBaht(totalCost)}
          </span>
          <span className="text-sm font-semibold text-amber-400/70">บาท</span>
        </div>
        {/* TOU Badge */}
        {touPeriod && (
          <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5
                            border rounded-full mt-0.5 ${touClass}`}>
            {touLabel}
          </span>
        )}
      </div>

      {/* ─── RIGHT: นาฬิกา + Status ─── */}
      <div className="flex flex-col items-end gap-1">
        <div className="font-mono text-2xl font-black tracking-wider text-white
                        drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]">
          {time || '00:00:00'}
        </div>
        <div className="text-[11px] text-white/40 font-medium">{date}</div>
        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
          <span className={`text-[10px] font-bold tracking-widest uppercase ${sc.text}`}>
            {sc.label}
          </span>
        </div>
      </div>
    </header>
  );
}
