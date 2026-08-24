/**
 * ============================================================
 *  Express App Configuration
 *  - Middleware setup
 *  - Route registration
 *  - Error handling
 * ============================================================
 */
'use strict';

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');

const energyRoutes = require('./routes/energyRoutes');

const app = express();

// ══════════════════════════════════════════════════════════
//  Security Middleware
// ══════════════════════════════════════════════════════════
app.use(helmet({
  // อนุญาตให้ Frontend ใน Network เดียวกัน เข้าถึง API
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — อนุญาตทุกโดเมนในเครือข่ายท้องถิ่น
// (สำหรับ Production ควรกำหนด origin เฉพาะ)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Device-ID'],
}));

// ══════════════════════════════════════════════════════════
//  Logging
// ══════════════════════════════════════════════════════════
// แสดง Log เฉพาะ POST /api/energy-data หรือ Request ที่ไม่ GET
const skipGetFilter = (req) =>
  req.method === 'GET' && req.path !== '/api/health';

app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  skip: (req) => req.method === 'GET' && req.path.includes('/energy/latest'),
}));

// ══════════════════════════════════════════════════════════
//  Body Parsers
// ══════════════════════════════════════════════════════════
// กำหนด limit 1MB เพื่อป้องกัน Body too large
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ══════════════════════════════════════════════════════════
//  Serve Frontend Static Files (Phase 3)
//  เมื่อ build Dashboard แล้วก็วางไฟล์ ไว้ใน ../Frontend/dist/
// ══════════════════════════════════════════════════════════
const frontendPath = path.join(__dirname, '../../Frontend/dist');
if (require('fs').existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
  console.log('[App] ✅ Serving Frontend from:', frontendPath);
}

// ══════════════════════════════════════════════════════════
//  API Routes
// ══════════════════════════════════════════════════════════
app.use('/api', energyRoutes);

// ══════════════════════════════════════════════════════════
//  404 Handler
// ══════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Route not found: ${req.method} ${req.path}`,
  });
});

// ══════════════════════════════════════════════════════════
//  Global Error Handler
// ══════════════════════════════════════════════════════════
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[App] ❌ Unhandled Error:', err.message);
  res.status(500).json({
    success: false,
    error:   'Internal Server Error',
    detail:  process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

module.exports = app;
