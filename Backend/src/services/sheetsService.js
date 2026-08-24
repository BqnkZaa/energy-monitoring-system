/**
 * ============================================================
 *  Google Sheets Integration Service
 *  - เชื่อมต่อด้วย Service Account (JSON Key)
 *  - Append รายวัน ทุกชั่วโมง (Cron-based)
 * ============================================================
 *
 *  การตั้งค่า Google Sheets API:
 *  1. ไปที่ https://console.cloud.google.com/
 *  2. สร้าง Service Account + ดาวน์โหลด JSON Key
 *  3. เปิดใช้ Google Sheets API ใน Project
 *  4. แชร์ Spreadsheet กับ Email ของ Service Account (Editor)
 *  5. วางไฟล์ JSON Key ไว้ที่ ./config/google-service-account.json
 * ============================================================
 */
'use strict';

const { google } = require('googleapis');
const path       = require('path');
const fs         = require('fs');
const config     = require('../config/config');
const db         = require('../database/db');
const billingSettingsService = require('./billingSettingsService');

// Sheets client (lazy-initialized)
let sheetsClient = null;

/**
 * เริ่มต้น Google Sheets Client
 * @returns {google.auth.GoogleAuth|null}
 */
async function getAuthClient() {
  if (sheetsClient) return sheetsClient;

  const keyPath = path.resolve(config.googleSheets.keyPath);

  if (!fs.existsSync(keyPath)) {
    console.warn(
      '[Sheets] ⚠️  ไม่พบไฟล์ Service Account Key:',
      keyPath,
      '\n         Google Sheets Sync ถูกปิดใช้งานชั่วคราว'
    );
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = await auth.getClient();
    console.log('[Sheets] ✅ Google Sheets Client เริ่มต้นสำเร็จ');
    return sheetsClient;
  } catch (err) {
    console.error('[Sheets] ❌ Auth Error:', err.message);
    return null;
  }
}

/**
 * ตรวจสอบและสร้าง Header Row ถ้า Sheet ว่างอยู่
 */
async function ensureSheetHeader(sheets) {
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName     = config.googleSheets.sheetName;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:A1`,
    });

    // ถ้ายังไม่มีข้อมูล = ใหม่ สร้าง Header
    if (!res.data.values || res.data.values.length === 0) {
      const headers = [
        [
          'Date',
          'Peak kWh', 'Off-Peak kWh', 'Total kWh',
          'Peak Cost (฿)', 'Off-Peak Cost (฿)', 'Total Cost (฿)',
          'Avg V L1', 'Avg V L2', 'Avg V L3',
          'Max Power (W)', 'Readings',
          'Synced At',
        ],
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range:          `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: headers },
      });
      console.log('[Sheets] ✅ สร้าง Header Row สำเร็จ');
    }
  } catch (err) {
    console.error('[Sheets] ❌ ensureSheetHeader Error:', err.message);
  }
}

/** สร้าง Sheet รายเดือนหากยังไม่มีใน Spreadsheet */
async function ensureSheetExists(sheets, sheetName) {
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const exists = metadata.data.sheets?.some(
    (sheet) => sheet.properties.title === sheetName
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    console.log(`[Sheets] ✅ สร้าง Sheet รายเดือน: ${sheetName}`);
  }
}

/** สร้างหัวตารางสำหรับสรุปค่าไฟรายเดือนและสูตร Ft/Service/VAT */
async function ensureMonthlySheetHeader(sheets) {
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName = config.googleSheets.monthlySheetName;
  await ensureSheetExists(sheets, sheetName);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:A1`,
  });
  if (res.data.values?.length) return;

  const headers = [[
    'Month', 'Peak kWh', 'Off-Peak kWh', 'Energy Cost (฿)',
    'Max Demand (kW)', 'Demand Rate (฿/kW)', 'Demand Cost (฿)',
    'Dashboard Total (฿)', 'Ft Rate (฿/kWh)', 'Ft Cost (฿)',
    'Service Charge (฿)', 'Sub Total (฿)', 'VAT Rate', 'VAT (฿)',
    'Grand Total (฿)', 'Updated At',
  ]];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:P1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: headers },
  });
  console.log('[Sheets] ✅ สร้าง Header สรุปรายเดือนสำเร็จ');
}

/**
 * Sync ข้อมูลจาก daily_summary ที่ยังไม่ Sync ไป Google Sheets
 * @returns {{synced: number, errors: number}}
 */
async function syncDailySummaryToSheets() {
  console.log('[Sheets] ⏳ เริ่มต้น Google Sheets Sync...');

  if (!config.googleSheets.spreadsheetId) {
    console.warn('[Sheets] ⚠️  ยังไม่ตั้งค่า GOOGLE_SPREADSHEET_ID — ข้าม Sync');
    return { synced: 0, errors: 0 };
  }

  const authClient = await getAuthClient();
  if (!authClient) return { synced: 0, errors: 1 };

  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName     = config.googleSheets.sheetName;

  await ensureSheetHeader(sheets);

  // ดึงรายการที่ยังไม่ Sync (synced_to_sheets = 0)
  // เฟ้นเฉพาะวันก่อนหน้าเดียว (exclude today เพราะยังไม่สิ้นวัน)
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare(
    `SELECT * FROM daily_summary
     WHERE synced_to_sheets = 0 AND date < ?
     ORDER BY date ASC
     LIMIT 30`
  ).all(today);

  if (rows.length === 0) {
    console.log('[Sheets] ✔️ ไม่มีรายการใหม่ที่ต้อง Sync');
    return { synced: 0, errors: 0 };
  }

  const values = rows.map((r) => [
    r.date,
    parseFloat((r.peak_kwh     || 0).toFixed(4)),
    parseFloat((r.off_peak_kwh || 0).toFixed(4)),
    parseFloat((r.total_kwh    || 0).toFixed(4)),
    parseFloat((r.peak_cost    || 0).toFixed(2)),
    parseFloat((r.off_peak_cost|| 0).toFixed(2)),
    parseFloat((r.total_cost   || 0).toFixed(2)),
    parseFloat((r.avg_voltage_l1|| 0).toFixed(2)),
    parseFloat((r.avg_voltage_l2|| 0).toFixed(2)),
    parseFloat((r.avg_voltage_l3|| 0).toFixed(2)),
    parseFloat((r.max_power_w  || 0).toFixed(2)),
    r.reading_count || 0,
    new Date().toISOString(),
  ]);

  let synced = 0;
  let errors = 0;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range:            `${sheetName}!A2`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values },
    });

    // อัปเดต Flag synced_to_sheets = 1
    const syncedIds = rows.map((r) => r.id);
    const placeholders = syncedIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE daily_summary SET synced_to_sheets = 1 WHERE id IN (${placeholders})`
    ).run(...syncedIds);

    synced = rows.length;
    console.log(`[Sheets] ✅ Sync สำเร็จ: ${synced} รายการ`);
  } catch (err) {
    errors = 1;
    console.error('[Sheets] ❌ Append Error:', err.message);
  }

  return { synced, errors };
}

/**
 * Sync ยอดเดือนปัจจุบันไปยัง Sheet แยกต่างหาก
 * คอลัมน์สูตรใน Sheet คำนวณ Ft, ค่าบริการ และ VAT โดยใช้ Dashboard Total
 * = Energy Cost + Demand Cost เป็นฐาน
 */
async function syncCurrentMonthlyBillingToSheets() {
  if (!config.googleSheets.spreadsheetId) {
    return { synced: 0, errors: 0 };
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthly = db.prepare(
    `SELECT month, peak_kwh, off_peak_kwh, energy_cost,
      max_demand_kw, demand_rate
     FROM monthly_cost WHERE month = ?`
  ).get(month);
  if (!monthly) return { synced: 0, errors: 0 };
  const billingSettings = billingSettingsService.getBillingSettings();

  const authClient = await getAuthClient();
  if (!authClient) return { synced: 0, errors: 1 };

  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName = config.googleSheets.monthlySheetName;

  try {
    await ensureMonthlySheetHeader(sheets);
    const monthCells = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });
    const values = monthCells.data.values || [];
    const existingIndex = values.findIndex((row, index) => index > 0 && row[0] === month);
    const rowNumber = existingIndex >= 0 ? existingIndex + 1 : values.length + 1;
    const row = [
      month,
      Number(monthly.peak_kwh || 0),
      Number(monthly.off_peak_kwh || 0),
      Number(monthly.energy_cost || 0),
      Number(monthly.max_demand_kw || 0),
      Number(monthly.demand_rate || billingSettings.demandRate),
      `=E${rowNumber}*F${rowNumber}`,
      `=D${rowNumber}+G${rowNumber}`,
      billingSettings.ftRate,
      `=(B${rowNumber}+C${rowNumber})*I${rowNumber}`,
      billingSettings.serviceCharge,
      `=H${rowNumber}+J${rowNumber}+K${rowNumber}`,
      billingSettings.vatRate,
      `=L${rowNumber}*M${rowNumber}`,
      `=L${rowNumber}+N${rowNumber}`,
      new Date().toISOString(),
    ];

    if (existingIndex >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowNumber}:P${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A${rowNumber}:P${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [row] },
      });
    }

    console.log(`[Sheets] ✅ Sync สรุปค่าไฟเดือน ${month} สำเร็จ`);
    return { synced: 1, errors: 0 };
  } catch (err) {
    console.error('[Sheets] ❌ Monthly Billing Sync Error:', err.message);
    return { synced: 0, errors: 1 };
  }
}

module.exports = {
  syncDailySummaryToSheets,
  syncCurrentMonthlyBillingToSheets,
  getAuthClient,
};
