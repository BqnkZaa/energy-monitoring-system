/**
 * ============================================================
 *  SQLite Database Manager (better-sqlite3)
 *  - ใช้ Synchronous API ของ better-sqlite3 ซึ่งเหมาะกับ
 *    Raspberry Pi เพราะไม่มี Overhead ของ async/await
 *  - สร้าง Schema อัตโนมัติเมื่อเริ่มต้น
 * ============================================================
 */
'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const config   = require('../config/config');

// ── สร้าง Directory สำหรับ Database ถ้ายังไม่มี ──────────────
const dbDir = path.dirname(path.resolve(config.database.path));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`[DB] สร้าง Directory: ${dbDir}`);
}

// ── เปิด/สร้าง Database ────────────────────────────────────
const db = new Database(path.resolve(config.database.path), {
  verbose: config.server.env === 'development'
    ? (msg) => console.log(`[SQLite] ${msg}`)
    : null,
});

// ── Performance Pragmas ────────────────────────────────────
// WAL mode เพิ่มประสิทธิภาพการเขียนอย่างมาก
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');  // สมดุล Speed / Safety
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -32000');   // 32 MB Cache

// ══════════════════════════════════════════════════════════
//  สร้าง Tables (Schema) — รันครั้งเดียวตอน Startup
// ══════════════════════════════════════════════════════════
db.exec(`
  -- ──────────────────────────────────────────────────────
  --  1. Raw Energy Readings (Time-Series)
  --     บันทึกทุก Payload ที่ได้รับจาก ESP32
  -- ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS energy_readings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       TEXT    NOT NULL,
    esp_timestamp   INTEGER,          -- millis() จาก ESP32
    received_at     TEXT    NOT NULL  -- ISO8601 จากเซิร์ฟเวอร์
                    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Phase L1
    l1_v   REAL, l1_a   REAL, l1_w   REAL,
    l1_kwh REAL, l1_hz  REAL, l1_pf  REAL, l1_valid INTEGER DEFAULT 1,

    -- Phase L2
    l2_v   REAL, l2_a   REAL, l2_w   REAL,
    l2_kwh REAL, l2_hz  REAL, l2_pf  REAL, l2_valid INTEGER DEFAULT 1,

    -- Phase L3
    l3_v   REAL, l3_a   REAL, l3_w   REAL,
    l3_kwh REAL, l3_hz  REAL, l3_pf  REAL, l3_valid INTEGER DEFAULT 1,

    -- Totals
    total_w   REAL,
    total_kwh REAL,

    -- TOU Info
    tou_period  TEXT,    -- 'peak' | 'off_peak'
    kwh_delta   REAL DEFAULT 0,  -- พลังงานที่ใช้ตั้งแต่รอบก่อน
    cost_delta  REAL DEFAULT 0   -- ค่าใช้จ่ายรอบนี้ (บาท)
  );

  -- Index สำหรับ Query ตาม received_at (Time-Series)
  CREATE INDEX IF NOT EXISTS idx_readings_received
    ON energy_readings(received_at);
  CREATE INDEX IF NOT EXISTS idx_readings_device
    ON energy_readings(device_id, received_at);

  -- ──────────────────────────────────────────────────────
  --  2. Monthly Cost Accumulation
  --     สะสมค่าไฟแยก Peak/Off-Peak รายเดือน
  -- ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS monthly_cost (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    month          TEXT    NOT NULL UNIQUE, -- 'YYYY-MM'
    peak_kwh       REAL    DEFAULT 0,
    off_peak_kwh   REAL    DEFAULT 0,
    total_kwh      REAL    DEFAULT 0,
    peak_cost      REAL    DEFAULT 0,
    off_peak_cost  REAL    DEFAULT 0,
    energy_cost    REAL    DEFAULT 0,
    max_demand_kw  REAL    DEFAULT 0,
    demand_rate    REAL    DEFAULT 132.93,
    demand_cost    REAL    DEFAULT 0,
    dashboard_cost REAL    DEFAULT 0,
    service_charge REAL    DEFAULT 312.24,
    total_cost     REAL    DEFAULT 0,
    last_updated   TEXT
  );

  -- ──────────────────────────────────────────────────────
  --  3. Daily Summary
  --     สรุปรายวันสำหรับ Google Sheets Export
  -- ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS daily_summary (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT    NOT NULL UNIQUE, -- 'YYYY-MM-DD'
    peak_kwh        REAL    DEFAULT 0,
    off_peak_kwh    REAL    DEFAULT 0,
    total_kwh       REAL    DEFAULT 0,
    peak_cost       REAL    DEFAULT 0,
    off_peak_cost   REAL    DEFAULT 0,
    total_cost      REAL    DEFAULT 0,
    avg_voltage_l1  REAL,
    avg_voltage_l2  REAL,
    avg_voltage_l3  REAL,
    max_power_w     REAL,
    reading_count   INTEGER DEFAULT 0,
    synced_to_sheets INTEGER DEFAULT 0,  -- 0 = ยังไม่ Sync, 1 = Sync แล้ว
    created_at      TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- ──────────────────────────────────────────────────────
  --  4. kWh Tracker (Single Row)
  --     เก็บค่า kWh ล่าสุดเพื่อคำนวณ Delta
  -- ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS kwh_tracker (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    last_total_kwh   REAL    DEFAULT 0,
    last_reading_at  TEXT,
    last_tou_period  TEXT    DEFAULT 'off_peak'
  );

  -- สร้างแถว Default ถ้ายังไม่มี
  INSERT OR IGNORE INTO kwh_tracker (id, last_total_kwh)
  VALUES (1, 0);

  -- ──────────────────────────────────────────────────────
  --  5. Billing Settings
  --     ค่าอัตราที่แก้ไขได้จาก Dashboard
  -- ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS billing_settings (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    peak_rate      REAL    NOT NULL,
    off_peak_rate  REAL    NOT NULL,
    demand_rate    REAL    NOT NULL,
    ft_rate        REAL    NOT NULL,
    service_charge REAL    NOT NULL,
    vat_rate       REAL    NOT NULL,
    updated_at     TEXT    NOT NULL
  );
`);

db.prepare(`
  INSERT OR IGNORE INTO billing_settings (
    id, peak_rate, off_peak_rate, demand_rate, ft_rate,
    service_charge, vat_rate, updated_at
  ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
`).run(
  config.tou.peakRate,
  config.tou.offPeakRate,
  config.tou.demandRate,
  config.tou.ftRate,
  config.tou.serviceCharge,
  config.tou.vatRate,
  new Date().toISOString(),
);

// รองรับฐานข้อมูลที่สร้างก่อนเพิ่มค่า Demand โดยไม่ต้องลบข้อมูลเดิม
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] เพิ่มคอลัมน์ ${table}.${column}`);
  }
}

ensureColumn('monthly_cost', 'energy_cost', 'REAL DEFAULT 0');
ensureColumn('monthly_cost', 'max_demand_kw', 'REAL DEFAULT 0');
ensureColumn('monthly_cost', 'demand_rate', 'REAL DEFAULT 132.93');
ensureColumn('monthly_cost', 'demand_cost', 'REAL DEFAULT 0');
ensureColumn('monthly_cost', 'dashboard_cost', 'REAL DEFAULT 0');

console.log(`[DB] ✅ SQLite เริ่มต้นสำเร็จ: ${path.resolve(config.database.path)}`);

module.exports = db;
