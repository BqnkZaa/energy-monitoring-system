/**
 * ============================================================
 *  Energy Controller
 *  จัดการ Request/Response ที่เข้ามาจาก Routes
 * ============================================================
 */
'use strict';

const db              = require('../database/db');
const touService      = require('../services/touService');
const wsService       = require('../services/websocketService');
const { formatDate }  = require('../utils/holidays');

// Prepared Statements
const stmtInsertReading = db.prepare(`
  INSERT INTO energy_readings (
    device_id, esp_timestamp, received_at,
    l1_v, l1_a, l1_w, l1_kwh, l1_hz, l1_pf, l1_valid,
    l2_v, l2_a, l2_w, l2_kwh, l2_hz, l2_pf, l2_valid,
    l3_v, l3_a, l3_w, l3_kwh, l3_hz, l3_pf, l3_valid,
    total_w, total_kwh,
    tou_period, kwh_delta, cost_delta
  ) VALUES (
    @deviceId, @espTimestamp, @receivedAt,
    @l1v, @l1a, @l1w, @l1kwh, @l1hz, @l1pf, @l1valid,
    @l2v, @l2a, @l2w, @l2kwh, @l2hz, @l2pf, @l2valid,
    @l3v, @l3a, @l3w, @l3kwh, @l3hz, @l3pf, @l3valid,
    @totalW, @totalKwh,
    @touPeriod, @kwhDelta, @costDelta
  )
`);

// ═══════════════════════════════════════════════════════════════
//  POST /api/energy-data
//  รับข้อมูลจาก ESP32 → บันทึก DB → คำนวณ TOU → Broadcast WS
// ═══════════════════════════════════════════════════════════════

/**
 * รับข้อมูลพลังงานจาก ESP32
 */
async function receiveEnergyData(req, res) {
  const now     = new Date();
  const payload = req.body;

  // ── Validate Structure ──────────────────────────────────────
  if (!payload.device_id || !payload.phases) {
    return res.status(400).json({
      success: false,
      error:   'Missing required fields: device_id, phases',
    });
  }

  const { phases, total } = payload;
  const L1 = phases.L1 || {};
  const L2 = phases.L2 || {};
  const L3 = phases.L3 || {};

  // คำนวณ total_kwh รวม 3 เฟส
  const totalKwh = parseFloat(total?.kwh || 0) ||
    ((L1.kwh || 0) + (L2.kwh || 0) + (L3.kwh || 0));
  const totalW   = parseFloat(total?.w   || 0) ||
    ((L1.w   || 0) + (L2.w   || 0) + (L3.w   || 0));

  // ── คำนวณ TOU ──────────────────────────────────────────────
  const touResult = touService.processTouCost(
    totalKwh, phases, totalW, now
  );

  // ── บันทึก Raw Reading ─────────────────────────────────────
  const insertData = {
    deviceId:     payload.device_id,
    espTimestamp: payload.timestamp || null,
    receivedAt:   now.toISOString(),
    // L1
    l1v: L1.v || 0, l1a: L1.a || 0, l1w: L1.w || 0,
    l1kwh: L1.kwh || 0, l1hz: L1.hz || 0, l1pf: L1.pf || 0,
    l1valid: (L1.valid !== false) ? 1 : 0,
    // L2
    l2v: L2.v || 0, l2a: L2.a || 0, l2w: L2.w || 0,
    l2kwh: L2.kwh || 0, l2hz: L2.hz || 0, l2pf: L2.pf || 0,
    l2valid: (L2.valid !== false) ? 1 : 0,
    // L3
    l3v: L3.v || 0, l3a: L3.a || 0, l3w: L3.w || 0,
    l3kwh: L3.kwh || 0, l3hz: L3.hz || 0, l3pf: L3.pf || 0,
    l3valid: (L3.valid !== false) ? 1 : 0,
    // Totals
    totalW, totalKwh,
    // TOU
    touPeriod: touResult.period,
    kwhDelta:  touResult.kwhDelta,
    costDelta: touResult.costDelta,
  };

  const insertResult = stmtInsertReading.run(insertData);

  // ── ดึง Monthly Cost ล่าสุดเพื่อแนบใน Broadcast ────────────
  const monthlyCost = touService.getCurrentMonthlyCost();

  // ── Broadcast ผ่าน WebSocket ────────────────────────────────
  const broadcastPayload = {
    ...payload,
    tou:          touResult,
    monthly_cost: monthlyCost,
    server_time:  now.toISOString(),
  };
  wsService.broadcastEnergyData(broadcastPayload);

  // ── Response ────────────────────────────────────────────────
  return res.status(201).json({
    success:    true,
    reading_id: insertResult.lastInsertRowid,
    tou:        touResult,
  });
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/energy/latest
//  ดึงค่าล่าสุด (สำหรับ Dashboard โหลดครั้งแรก)
// ═══════════════════════════════════════════════════════════════
function getLatestReading(req, res) {
  const row = db.prepare(
    `SELECT * FROM energy_readings
     ORDER BY id DESC LIMIT 1`
  ).get();

  if (!row) {
    return res.status(404).json({ success: false, error: 'No data yet' });
  }

  const monthlyCost = touService.getCurrentMonthlyCost();
  return res.json({ success: true, data: row, monthly_cost: monthlyCost });
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/energy/history?hours=24&limit=500
//  ดึงประวัติสำหรับกราฟ
// ═══════════════════════════════════════════════════════════════
function getHistory(req, res) {
  const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168); // max 7 วัน
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);

  const rows = db.prepare(`
    SELECT id, received_at, device_id,
           l1_v, l1_a, l1_w, l1_kwh, l1_pf,
           l2_v, l2_a, l2_w, l2_kwh, l2_pf,
           l3_v, l3_a, l3_w, l3_kwh, l3_pf,
           total_w, total_kwh, tou_period, cost_delta
    FROM energy_readings
    WHERE received_at >= datetime('now', '-' || ? || ' hours')
    ORDER BY id DESC
    LIMIT ?
  `).all(hours, limit);

  return res.json({
    success: true,
    count:   rows.length,
    hours,
    data:    rows.reverse(),
  });
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/energy/monthly?month=2026-07
//  สรุปรายเดือน
// ═══════════════════════════════════════════════════════════════
function getMonthlySummary(req, res) {
  const now   = new Date();
  const month = req.query.month ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const data = db.prepare(
    `SELECT * FROM monthly_cost WHERE month = ?`
  ).get(month);

  const dailyRows = db.prepare(
    `SELECT * FROM daily_summary WHERE date LIKE ? ORDER BY date ASC`
  ).all(`${month}%`);

  return res.json({
    success: true,
    month,
    summary: data || null,
    daily:   dailyRows,
  });
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/health — Health Check
// ═══════════════════════════════════════════════════════════════
function healthCheck(req, res) {
  const wsClients = wsService.getClientCount();
  const dbCheck   = db.prepare('SELECT COUNT(*) as c FROM energy_readings').get();

  return res.json({
    status:      'ok',
    uptime_sec:  Math.floor(process.uptime()),
    ws_clients:  wsClients,
    total_readings: dbCheck.c,
    server_time: new Date().toISOString(),
  });
}

module.exports = {
  receiveEnergyData,
  getLatestReading,
  getHistory,
  getMonthlySummary,
  healthCheck,
};
