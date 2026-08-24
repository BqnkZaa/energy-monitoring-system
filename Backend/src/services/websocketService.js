/**
 * ============================================================
 *  WebSocket Service
 *  - ใช้ 'ws' library ที่เบา
 *  - Broadcast ข้อมูลพลังงานไปยัง Client ทุกตัวที่เชื่อมต่อ
 *  - Heartbeat สำหรับตรวจสอบ Connection ที่ Dead
 * ============================================================
 */
'use strict';

const WebSocket = require('ws');
const config    = require('../config/config');
const billingSettingsService = require('./billingSettingsService');
const sheetsService = require('./sheetsService');

let wss = null;
let heartbeatInterval = null;

/**
 * เริ่มต้น WebSocket Server โดยใช้ HTTP Server ที่มีอยู่แล้ว
 * @param {http.Server} httpServer
 */
function initWebSocket(httpServer) {
  wss = new WebSocket.Server({
    server: httpServer,
    // Path เฉพาะเจาะ WebSocket (Client ต้อง connect ที่ /ws)
    path: '/ws',
  });

  console.log('[WS] ✅ WebSocket Server เริ่มต้นสำเร็จ — path: /ws');

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] 🔌 Client เชื่อมต่อ: ${clientIp} | ทั้งหมด: ${getClientCount()} ตัว`);

    // ทำ Alive Flag สำหรับ Heartbeat
    ws.isAlive = true;

    // รับ pong จาก client = ยังมีชีวิต
    ws.on('pong', () => { ws.isAlive = true; });

    // รับ Message จาก Client (Dashboard ส่ง command มา)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      console.log(`[WS] 🔔 Client ออก: ${clientIp} | เหลือ: ${getClientCount() - 1} ตัว`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] ❌ Client Error: ${err.message}`);
    });

    // ส่ง Welcome message ทันทีที่ connect
    safeSend(ws, {
      type:    'connected',
      message: 'Energy Monitor WebSocket Server — Connected',
      serverTime: new Date().toISOString(),
    });
    safeSend(ws, {
      type: 'billing_settings',
      data: billingSettingsService.getBillingSettings(),
    });
  });

  // ── Heartbeat: Ping ทุก 30 วินาที ────────────────────────────────
  heartbeatInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('[WS] 💤 Terminate Dead Connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();  // Client ต้อง pong กลับมา
    });
  }, config.websocket.heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

/**
 * Broadcast ข้อมูลไปยัง Client ที่เชื่อมต่อทุกตัว
 * @param {object} data — จะถูก JSON.stringify ก่อนส่ง
 */
function broadcastEnergyData(data) {
  if (!wss || wss.clients.size === 0) return;

  const payload = JSON.stringify({
    type: 'energy_update',
    data,
    serverTime: new Date().toISOString(),
  });

  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    console.log(`[WS] 📡 Broadcast → ${sentCount} Client(s)`);
  }
}

/** ส่งค่าอัตราปัจจุบันไปยัง Dashboard ทุกหน้าที่เชื่อมต่ออยู่ */
function broadcastBillingSettings(settings) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'billing_settings', data: settings });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

/**
 * จัดการ Message จาก Client
 * @param {WebSocket} ws
 * @param {object}    msg
 */
function handleClientMessage(ws, msg) {
  switch (msg.type) {
    case 'ping':
      safeSend(ws, { type: 'pong', serverTime: new Date().toISOString() });
      break;
    case 'get_billing_settings':
      safeSend(ws, {
        type: 'billing_settings',
        data: billingSettingsService.getBillingSettings(),
      });
      break;
    case 'update_billing_settings':
      try {
        const settings = billingSettingsService.updateBillingSettings(msg.data || {});
        broadcastBillingSettings(settings);
        console.log('[WS] ⚙️  อัปเดตค่าอัตราจาก Dashboard');
        sheetsService.syncCurrentMonthlyBillingToSheets()
          .catch((err) => console.error('[WS] Monthly Billing Sync Error:', err.message));
      } catch (err) {
        safeSend(ws, { type: 'error', message: err.message });
      }
      break;
    default:
      safeSend(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

/**
 * ส่ง Message อย่างปลอดภัย (try/catch)
 */
function safeSend(ws, data) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch (err) {
    console.error('[WS] safeSend Error:', err.message);
  }
}

/** ดูจำนวน Client ที่เชื่อมต่ออยู่ */
function getClientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = {
  initWebSocket,
  broadcastEnergyData,
  broadcastBillingSettings,
  getClientCount,
};
