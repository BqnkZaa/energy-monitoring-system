/**
 * ============================================================
 *  Central Configuration Module
 *  โหลดค่าจาก .env และกำหนด Default ให้ครบถ้วน
 * ============================================================
 */
'use strict';

require('dotenv').config();

const config = {
  // ── Server ─────────────────────────────────────────────────
  server: {
    port: parseInt(process.env.PORT, 10) || 8000,
    env: process.env.NODE_ENV || 'development',
  },

  // ── Database ───────────────────────────────────────────────
  database: {
    path: process.env.DB_PATH || './data/energy.db',
  },

  // ── Security ───────────────────────────────────────────────
  security: {
    apiKey: process.env.API_KEY || 'energy_monitor_secret_key_change_me',
  },

  // ── Google Sheets ──────────────────────────────────────────
  googleSheets: {
    keyPath:       process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './config/google-service-account.json',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    sheetName:     process.env.GOOGLE_SHEET_NAME || 'EnergyData',
    monthlySheetName: process.env.GOOGLE_MONTHLY_SHEET_NAME || 'MonthlyBilling',
    // Sync ทุกชั่วโมง (Cron Expression)
    syncCron: '0 * * * *',
  },

  // ── TOU Tariff ─────────────────────────────────────────────
  // อัตราค่าไฟฟ้า MEA/PEA ประเภทที่ 3 กิจการขนาดเล็ก แรงดัน 22 kV
  tou: {
    // Peak: จ-ศ 09:00-22:00 (บาท/kWh)
    peakRate:      parseFloat(process.env.TOU_PEAK_RATE)      || 4.1025,
    // Off-Peak: ทุกช่วงที่เหลือ (บาท/kWh)
    offPeakRate:   parseFloat(process.env.TOU_OFF_PEAK_RATE)  || 2.5849,
    // ค่าบริการรายเดือนคงที่ (บาท)
    serviceCharge: parseFloat(process.env.TOU_SERVICE_CHARGE) || 312.24,
    // ค่า Demand จากกำลังไฟฟ้าสูงสุดของเดือน (บาท/kW)
    demandRate: parseFloat(process.env.DEMAND_RATE) || 132.93,
    // ใช้เฉพาะสูตรสรุปยอดใน Google Sheets
    ftRate: parseFloat(process.env.FT_RATE) || 0,
    vatRate: parseFloat(process.env.VAT_RATE) || 0.07,
    // ชั่วโมง Peak (inclusive start, exclusive end)
    peakStartHour: 9,   // 09:00
    peakEndHour:   22,  // 22:00
  },

  // ── WebSocket ──────────────────────────────────────────────
  websocket: {
    // ส่ง Heartbeat ping ทุก 30 วินาที เพื่อตรวจสอบ client ที่ยังเชื่อมต่ออยู่
    heartbeatIntervalMs: 30000,
  },

  // ── Data Retention ────────────────────────────────────────
  retention: {
    // เก็บข้อมูล Raw readings ไว้กี่วัน (หลังจากนั้น Auto-purge)
    rawDataDays: 90,
  },
};

module.exports = config;
