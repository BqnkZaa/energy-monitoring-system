/**
 * ============================================================
 *  API Routes Definition
 * ============================================================
 */
'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/energyController');
const config     = require('../config/config');

// ── API Key Middleware ────────────────────────────────────────
function apiKeyAuth(req, res, next) {
  // Health check ไม่ต้องใช้ Key
  if (req.path === '/health') return next();

  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== config.security.apiKey) {
    return res.status(401).json({
      success: false,
      error:   'Unauthorized — Invalid API Key'
    });
  }
  return next();
}

router.use(apiKeyAuth);

// ── Routes ───────────────────────────────────────────────────

// Health Check (ไม่ต้อง Auth)
router.get('/health', controller.healthCheck);

// รับข้อมูลจาก ESP32
router.post('/energy-data', controller.receiveEnergyData);

// ดึงข้อมูลล่าสุด
router.get('/energy/latest', controller.getLatestReading);

// ดึงประวัติสำหรับกราฟ
router.get('/energy/history', controller.getHistory);

// สรุปรายเดือน
router.get('/energy/monthly', controller.getMonthlySummary);

module.exports = router;
