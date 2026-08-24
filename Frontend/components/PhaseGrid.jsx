'use client';
import PhaseCard from './PhaseCard';

/**
 * PhaseGrid Component
 * แสดง Phase Card ทั้ง 3 เรียงแถว (L1, L2, L3)
 */
export default function PhaseGrid({ phases }) {
  return (
    <div className="flex flex-col gap-3 w-[420px] shrink-0">
      <PhaseCard phase="L1" phaseData={phases?.L1} />
      <PhaseCard phase="L2" phaseData={phases?.L2} />
      <PhaseCard phase="L3" phaseData={phases?.L3} />
    </div>
  );
}
