'use client';
import { useState, useEffect, useRef } from 'react';

const MAX_POINTS = 60; // จัดเก็บ 60 จุด (~2 นาที ที่ interval 2 วินาที)

/**
 * Custom Hook: useChartData
 * จัดการ Rolling Buffer ของ Chart Data
 * @param {object} liveData - ข้อมูลล่าสุดจาก useWebSocket
 * @returns {Array} chartPoints
 */
export function useChartData(liveData) {
  const [chartPoints, setChartPoints] = useState([]);
  const prevTotalW = useRef(null);

  useEffect(() => {
    if (!liveData?.total) return;

    const totalW = parseFloat(liveData.total.w) || 0;
    const l1W    = parseFloat(liveData.phases?.L1?.w) || 0;
    const l2W    = parseFloat(liveData.phases?.L2?.w) || 0;
    const l3W    = parseFloat(liveData.phases?.L3?.w) || 0;

    // ข้ามถ้า totalW ไม่เปลี่ยน (ป้องกัน duplicate points)
    if (prevTotalW.current === totalW && chartPoints.length > 0) return;
    prevTotalW.current = totalW;

    const now = new Date();
    const timeLabel = now.toLocaleTimeString('th-TH', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const newPoint = {
      time:   timeLabel,
      total:  Math.round(totalW),
      L1:     Math.round(l1W),
      L2:     Math.round(l2W),
      L3:     Math.round(l3W),
    };

    setChartPoints((prev) => {
      const next = [...prev, newPoint];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, [liveData]);

  return chartPoints;
}
