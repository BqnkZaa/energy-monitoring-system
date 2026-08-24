/**
 * Utility formatters สำหรับหน้า Dashboard
 */

/** Format ตัวเลขทศนิยม 2 ตำแหน่ง */
export const fmt2 = (v) =>
  v == null || isNaN(v) ? '—' : parseFloat(v).toFixed(2);

/** Format ตัวเลขทศนิยม 1 ตำแหน่ง */
export const fmt1 = (v) =>
  v == null || isNaN(v) ? '—' : parseFloat(v).toFixed(1);

/** Format ตัวเลขจำนวนเต็ม */
export const fmt0 = (v) =>
  v == null || isNaN(v) ? '—' : Math.round(parseFloat(v)).toLocaleString('th-TH');

/** Format ค่าเงินไทย ทศนิยม 2 ตำแหน่ง */
export const fmtBaht = (v) =>
  v == null || isNaN(v)
    ? '—'
    : parseFloat(v).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

/** Format Power Factor ทศนิยม 2 ตำแหน่ง (0.00–1.00) */
export const fmtPF = (v) =>
  v == null || isNaN(v) ? '—' : Math.min(1, Math.max(0, parseFloat(v))).toFixed(2);

/** Format kWh ทศนิยม 3 ตำแหน่ง */
export const fmtKwh = (v) =>
  v == null || isNaN(v) ? '—' : parseFloat(v).toFixed(3);

/** แสดง TOU Period เป็นภาษาไทย */
export const fmtTouPeriod = (period) =>
  period === 'peak' ? 'ช่วง Peak' : 'ช่วง Off-Peak';

/** สีตาม TOU Period */
export const touColor = (period) =>
  period === 'peak' ? '#f97316' : '#818cf8';
