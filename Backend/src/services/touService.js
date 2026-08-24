/**
 * ============================================================
 *  TOU (Time of Use) Calculation Service
 *  ประเภทที่ 3 — กิจการขนาดเล็ก แรงดัน 22 kV
 * ============================================================
 *
 *  กฎ TOU:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  PEAK    (4.1025 บาท/kWh)                               │
 *  │  → จ-ศ เวลา 09:00–22:00                                │
 *  │  → รวมวันพืชมงคล (แม้จะเป็นวันหยุดราชการ)              │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  OFF-PEAK (2.5849 บาท/kWh)                              │
 *  │  → จ-ศ เวลา 22:00–09:00 (ดึกถึงเช้า)                  │
 *  │  → ส-อ ทั้งวัน 24 ชั่วโมง                              │
 *  │  → วันหยุดราชการปกติ ทั้งวัน (ยกเว้นวันพืชมงคล)        │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  หมายเหตุ Logic การคำนวณ:
 *    delta_kWh = current_total_kWh - previous_total_kWh
 *    energy cost = delta_kWh × rate (ตามช่วงเวลา)
 *    dashboard cost = energy cost สะสม + (Demand kW สูงสุด × demand rate)
 *    โดย Ft, ค่าบริการ และ VAT คำนวณต่อใน Google Sheets
 * ============================================================
 */
'use strict';

const config = require('../config/config');
const db     = require('../database/db');
const billingSettingsService = require('./billingSettingsService');
const {
  isPublicHoliday,
  isPheutsaMonDay,
  formatDate,
} = require('../utils/holidays');

// ── Prepared Statements สำหรับ Performance ────────────────────
const stmtGetTracker = db.prepare(
  `SELECT last_total_kwh, last_reading_at, last_tou_period
   FROM kwh_tracker WHERE id = 1`
);

const stmtUpdateTracker = db.prepare(
  `UPDATE kwh_tracker
   SET last_total_kwh = @kwh, last_reading_at = @readingAt,
       last_tou_period = @period
   WHERE id = 1`
);

const stmtUpsertMonthlyCost = db.prepare(`
  INSERT INTO monthly_cost (month, peak_kwh, off_peak_kwh, total_kwh,
    peak_cost, off_peak_cost, energy_cost,
    max_demand_kw, demand_rate, demand_cost, dashboard_cost,
    service_charge, total_cost, last_updated)
  VALUES (@month, @peakKwh, @offPeakKwh, @totalKwh,
    @peakCost, @offPeakCost, @energyCost,
    @maxDemandKw, @demandRate, @demandCost, @dashboardCost,
    @serviceCharge, @totalCost, @now)
  ON CONFLICT(month) DO UPDATE SET
    peak_kwh       = peak_kwh       + @peakKwh,
    off_peak_kwh   = off_peak_kwh   + @offPeakKwh,
    total_kwh      = total_kwh      + @totalKwh,
    peak_cost      = peak_cost      + @peakCost,
    off_peak_cost  = off_peak_cost  + @offPeakCost,
    energy_cost    = (peak_cost + excluded.peak_cost)
                   + (off_peak_cost + excluded.off_peak_cost),
    max_demand_kw  = MAX(max_demand_kw, excluded.max_demand_kw),
    demand_rate    = excluded.demand_rate,
    demand_cost    = MAX(max_demand_kw, excluded.max_demand_kw) * excluded.demand_rate,
    dashboard_cost = ((peak_cost + excluded.peak_cost)
                   +  (off_peak_cost + excluded.off_peak_cost))
                   + (MAX(max_demand_kw, excluded.max_demand_kw) * excluded.demand_rate),
    total_cost     = peak_cost + excluded.peak_cost
                   + off_peak_cost + excluded.off_peak_cost
                   + service_charge,
    last_updated   = @now
`);

const stmtUpsertDailySummary = db.prepare(`
  INSERT INTO daily_summary (date, peak_kwh, off_peak_kwh, total_kwh,
    peak_cost, off_peak_cost, total_cost,
    avg_voltage_l1, avg_voltage_l2, avg_voltage_l3,
    max_power_w, reading_count)
  VALUES (@date, @peakKwh, @offPeakKwh, @totalKwh,
    @peakCost, @offPeakCost, @totalCost,
    @avgV1, @avgV2, @avgV3, @maxW, 1)
  ON CONFLICT(date) DO UPDATE SET
    peak_kwh      = peak_kwh      + @peakKwh,
    off_peak_kwh  = off_peak_kwh  + @offPeakKwh,
    total_kwh     = total_kwh     + @totalKwh,
    peak_cost     = peak_cost     + @peakCost,
    off_peak_cost = off_peak_cost + @offPeakCost,
    total_cost    = peak_cost + excluded.peak_cost
                  + off_peak_cost + excluded.off_peak_cost,
    avg_voltage_l1 = (avg_voltage_l1 * reading_count + @avgV1) / (reading_count + 1),
    avg_voltage_l2 = (avg_voltage_l2 * reading_count + @avgV2) / (reading_count + 1),
    avg_voltage_l3 = (avg_voltage_l3 * reading_count + @avgV3) / (reading_count + 1),
    max_power_w   = MAX(max_power_w, @maxW),
    reading_count = reading_count + 1
`);

// ═══════════════════════════════════════════════════════════════
//  📊  Core TOU Logic
// ═══════════════════════════════════════════════════════════════

/**
 * ตรวจสอบว่าเวลาที่กำหนดอยู่ในช่วง Peak หรือ Off-Peak
 * @param {Date} date - วันเวลาที่ต้องการตรวจสอบ (ใช้ Local Time)
 * @returns {'peak' | 'off_peak'}
 */
function getTouPeriod(date) {
  const dayOfWeek = date.getDay(); // 0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์
  const hour      = date.getHours(); // 0-23

  // ── 1. เสาร์หรืออาทิตย์ → Off-Peak ทั้งวัน ───────────────
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'off_peak';
  }

  // ── 2. วันหยุดราชการปกติ (ยกเว้นวันพืชมงคล) → Off-Peak ──
  if (isPublicHoliday(date) && !isPheutsaMonDay(date)) {
    return 'off_peak';
  }

  // ── 3. จ-ศ (รวมวันพืชมงคล) ช่วง Peak: 09:00-22:00 ────────
  // hour >= 9  → ตั้งแต่ 09:00:00
  // hour < 22  → ถึง 21:59:59 (22:00 ขึ้นต้นเป็น Off-Peak)
  if (hour >= config.tou.peakStartHour && hour < config.tou.peakEndHour) {
    return 'peak';
  }

  // ── 4. ช่วงเวลาอื่นทั้งหมด → Off-Peak ──────────────────────
  return 'off_peak';
}

/**
 * คำนวณค่าไฟตาม TOU Period
 * @param {number} kwhDelta - พลังงานที่ใช้ไป (kWh)
 * @param {'peak' | 'off_peak'} period
 * @returns {number} ค่าไฟ (บาท)
 */
function calculateCost(kwhDelta, period, billingSettings = config.tou) {
  if (kwhDelta <= 0) return 0;
  const rate = period === 'peak'
    ? billingSettings.peakRate
    : billingSettings.offPeakRate;
  return parseFloat((kwhDelta * rate).toFixed(4));
}

// ═══════════════════════════════════════════════════════════════
//  💾  Main Processing Function
// ═══════════════════════════════════════════════════════════════

/**
 * ประมวลผลข้อมูล kWh ที่ได้รับจาก ESP32
 * - คำนวณ Delta kWh จากค่าสะสมล่าสุด
 * - คำนวณค่าไฟตาม TOU Period
 * - อัปเดต monthly_cost, daily_summary, kwh_tracker
 *
 * @param {number} currentTotalKwh  - ค่า kWh รวมล่าสุดจาก ESP32
 * @param {object} phases           - ข้อมูล phases (L1, L2, L3)
 * @param {number} totalW           - กำลังไฟรวม (W)
 * @param {Date}   [now=new Date()] - เวลาปัจจุบัน (inject ได้เพื่อ testing)
 * @returns {object} ผลลัพธ์การคำนวณ
 */
function processTouCost(currentTotalKwh, phases, totalW, now = new Date()) {
  const tracker = stmtGetTracker.get();
  const lastKwh  = tracker.last_total_kwh || 0;
  // แถวเริ่มต้นของ tracker มีค่า kWh = 0 แต่ยังไม่มีเวลาอ่านข้อมูล
  // จึงใช้ last_reading_at เป็นตัวบอกว่าข้อมูลนี้คือค่าฐานจากมิเตอร์จริง
  const isFirstReading = !tracker.last_reading_at;

  // ── คำนวณ Delta ──────────────────────────────────────────────
  let kwhDelta = isFirstReading ? 0 : currentTotalKwh - lastKwh;

  if (isFirstReading) {
    console.log(
      `[TOU] ตั้งค่า kWh ฐานเริ่มต้น: ${currentTotalKwh.toFixed(3)} kWh ` +
      '— ยังไม่คิดค่าไฟจากข้อมูลรอบแรก'
    );
  }

  // ป้องกัน: ถ้า Delta ติดลบ = meter reset หรือ data anomaly
  if (kwhDelta < 0) {
    console.warn(`[TOU] ⚠️  kWh Delta ติดลบ (${kwhDelta.toFixed(3)}) — อาจเป็น Meter Reset`);
    kwhDelta = 0;
  }

  // ป้องกัน: ถ้า Delta ใหญ่ผิดปกติ (> 10 kWh ต่อ 2 วินาที = ไม่เป็นจริง)
  if (kwhDelta > 10) {
    console.warn(`[TOU] ⚠️  kWh Delta ผิดปกติ (${kwhDelta.toFixed(3)}) — ข้ามการคำนวณ`);
    kwhDelta = 0;
  }

  // ── TOU Period ──────────────────────────────────────────────
  const period = getTouPeriod(now);
  const billingSettings = billingSettingsService.getBillingSettings();
  const costDelta = calculateCost(kwhDelta, period, billingSettings);

  // ── สร้างค่าสำหรับ Upsert ─────────────────────────────────
  const month   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dateStr = formatDate(now);
  const nowIso  = now.toISOString();

  const isPeak    = period === 'peak';
  const peakKwh   = isPeak ? kwhDelta : 0;
  const offKwh    = isPeak ? 0 : kwhDelta;
  const peakCost  = isPeak ? costDelta : 0;
  const offCost   = isPeak ? 0 : costDelta;
  const currentDemandKw = parseFloat((Math.max(0, Number(totalW) || 0) / 1000).toFixed(4));
  const demandCost = parseFloat((currentDemandKw * billingSettings.demandRate).toFixed(4));
  const energyCost = peakCost + offCost;
  const dashboardCost = energyCost + demandCost;

  // ── Voltage เฉลี่ย (ใช้เฉพาะเฟสที่ valid) ────────────────
  const avgV1 = phases.L1?.valid !== false ? (phases.L1?.v || 0) : 0;
  const avgV2 = phases.L2?.valid !== false ? (phases.L2?.v || 0) : 0;
  const avgV3 = phases.L3?.valid !== false ? (phases.L3?.v || 0) : 0;

  // ── Atomic Transaction (DB) ────────────────────────────────
  const runTransaction = db.transaction(() => {
    // 1. อัปเดต Monthly Cost
    stmtUpsertMonthlyCost.run({
      month,
      peakKwh,
      offPeakKwh:    offKwh,
      totalKwh:      kwhDelta,
      peakCost,
      offPeakCost:   offCost,
      energyCost,
      maxDemandKw:   currentDemandKw,
      demandRate:    billingSettings.demandRate,
      demandCost,
      dashboardCost,
      serviceCharge: billingSettings.serviceCharge,
      totalCost:     peakCost + offCost + billingSettings.serviceCharge,
      now:           nowIso,
    });

    // 2. อัปเดต Daily Summary
    stmtUpsertDailySummary.run({
      date:        dateStr,
      peakKwh,
      offPeakKwh:  offKwh,
      totalKwh:    kwhDelta,
      peakCost,
      offPeakCost: offCost,
      totalCost:   peakCost + offCost,
      avgV1,
      avgV2,
      avgV3,
      maxW:        totalW || 0,
    });

    // 3. อัปเดต kWh Tracker (สำหรับ Delta รอบถัดไป)
    stmtUpdateTracker.run({
      kwh:       currentTotalKwh,
      readingAt: nowIso,
      period,
    });
  });

  runTransaction();

  const result = {
    period,
    isFirstReading,
    kwhDelta:  parseFloat(kwhDelta.toFixed(5)),
    costDelta: parseFloat(costDelta.toFixed(4)),
    rate:      period === 'peak' ? billingSettings.peakRate : billingSettings.offPeakRate,
    demandKw: currentDemandKw,
    demandRate: billingSettings.demandRate,
    month,
    dateStr,
  };

  if (kwhDelta > 0) {
    console.log(
      `[TOU] ${period.toUpperCase().padEnd(8)} | ` +
      `+${kwhDelta.toFixed(4)} kWh | ` +
      `+${costDelta.toFixed(4)} ฿ | ${dateStr}`
    );
  }

  return result;
}

/**
 * ดึงยอดสะสมรายเดือนปัจจุบัน
 * @returns {object|null}
 */
function getCurrentMonthlyCost() {
  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return db.prepare(
    `SELECT * FROM monthly_cost WHERE month = ?`
  ).get(month);
}

/**
 * ดึง Daily Summary ของวันที่กำหนด
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {object|null}
 */
function getDailySummary(dateStr) {
  return db.prepare(
    `SELECT * FROM daily_summary WHERE date = ?`
  ).get(dateStr);
}

module.exports = {
  getTouPeriod,
  calculateCost,
  processTouCost,
  getCurrentMonthlyCost,
  getDailySummary,
};
