/**
 * ============================================================
 *  Server Entry Point
 *  - สร้าง HTTP Server
 *  - แนบ WebSocket Server เข้ากับ HTTP Server
 *  - เริ่มต้น Scheduled Jobs (Google Sheets Sync)
 * ============================================================
 */
'use strict';

require('dotenv').config();

const http    = require('http');
const cron    = require('node-cron');
const app     = require('./app');
const config  = require('./config/config');
const wsService     = require('./services/websocketService');
const sheetsService = require('./services/sheetsService');

// ── สร้าง HTTP Server ──────────────────────────────────────────
const server = http.createServer(app);

// ── แนบ WebSocket Server เข้ากับ HTTP Server ───────────────────
wsService.initWebSocket(server);

// ── เริ่มต้น Server ────────────────────────────────────────────
const PORT = config.server.port;

server.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Energy Monitor — Backend Server     ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║   HTTP : http://0.0.0.0:${PORT}           ║`);
  console.log(`║   WS   : ws://0.0.0.0:${PORT}/ws         ║`);
  console.log(`║   Mode : ${config.server.env.padEnd(30)} ║`);
  console.log('╚══════════════════════════════════════════╝');
});

// ── เริ่มต้น Cron Jobs ──────────────────────────────────────
if (cron.validate(config.googleSheets.syncCron)) {
  cron.schedule(config.googleSheets.syncCron, async () => {
    console.log('[Cron] ⏰ เริ่มต้น Google Sheets Sync Job...');
    try {
      const dailyResult = await sheetsService.syncDailySummaryToSheets();
      const monthlyResult = await sheetsService.syncCurrentMonthlyBillingToSheets();
      console.log(
        `[Cron] Google Sheets Sync: daily=${dailyResult.synced}, ` +
        `monthly=${monthlyResult.synced}, errors=${dailyResult.errors + monthlyResult.errors}`
      );
    } catch (err) {
      console.error('[Cron] ❌ Sheets Sync Error:', err.message);
    }
  }, {
    timezone: process.env.TZ || 'Asia/Bangkok',
  });
  console.log(`[Cron] ✅ Google Sheets Sync ตั้งค่า: ${config.googleSheets.syncCron}`);
}

// ── ตรวจสอบและ Purge ข้อมูลเก่า ทุก เที่ยงคืน ──────────────
cron.schedule('0 2 * * *', () => {
  try {
    const { Database } = require('better-sqlite3');
    const db = require('./database/db');
    const retentionDays = require('./config/config').retention.rawDataDays;
    const result = db.prepare(
      `DELETE FROM energy_readings
       WHERE received_at < datetime('now', '-' || ? || ' days')`
    ).run(retentionDays);
    if (result.changes > 0) {
      console.log(`[Cron] 🗄️  Purged ${result.changes} old readings (>${retentionDays} days)`);
    }
  } catch (err) {
    console.error('[Cron] ❌ Purge Error:', err.message);
  }
}, { timezone: process.env.TZ || 'Asia/Bangkok' });

// ── Graceful Shutdown ─────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — Graceful shutdown...');
  server.close(() => {
    console.log('[Server] HTTP Server ปิดแล้ว');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT (Ctrl+C) — Shutting down...');
  server.close(() => process.exit(0));
});

// จัดการ Uncaught Exception
process.on('uncaughtException', (err) => {
  console.error('[Server] ❌ Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] ❌ Unhandled Rejection:', reason);
});

module.exports = server;
