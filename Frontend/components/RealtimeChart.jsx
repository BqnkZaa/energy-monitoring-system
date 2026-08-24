'use client';
import dynamic from 'next/dynamic';
import { useChartData } from '@/hooks/useChartData';

// Import Recharts ด้วย dynamic import (client-side only)
const ChartContent = dynamic(
  () => import('./RealtimeChartInner'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-white/20 text-sm font-medium tracking-widest animate-pulse">
        โหลดกราฟ...
      </div>
    </div>
  );
}

export default function RealtimeChart({ liveData }) {
  const chartPoints = useChartData(liveData);
  return <ChartContent chartPoints={chartPoints} />;
}
