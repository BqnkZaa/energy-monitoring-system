/**
 * ============================================================
 *  Google Sheets Integration Service
 *  - เชื่อมต่อด้วย Service Account (JSON Key)
 *  - ซิงก์สรุปรายชั่วโมง รายวัน และรายเดือน (Cron-based)
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

function getLocalDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.TZ || 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

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
 * ตรวจสอบและสร้าง Header Row สำหรับสรุปรายวันถ้า Sheet ว่างอยู่
 */
async function ensureDailySheetHeader(sheets) {
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName     = config.googleSheets.dailySheetName;

  await ensureSheetExists(sheets, sheetName);

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
          'Energy Cost (฿)', 'Max Demand (kW)', 'Demand Rate (฿/kW)',
          'Demand Cost (฿, reference)', 'Dashboard Total (฿, reference)',
          'Avg V L1', 'Avg V L2', 'Avg V L3',
          'Max Power (W)', 'Readings',
          'Updated At',
        ],
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range:          `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: headers },
      });
      console.log('[Sheets] ✅ สร้าง Header สรุปรายวันสำเร็จ');
    }
  } catch (err) {
    console.error('[Sheets] ❌ ensureDailySheetHeader Error:', err.message);
  }
}

/** สร้างหัวตารางสรุปรายชั่วโมง หากยังไม่มี */
async function ensureHourlySheetHeader(sheets) {
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName = config.googleSheets.hourlySheetName;
  await ensureSheetExists(sheets, sheetName);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:A1`,
  });
  if (res.data.values?.length) return;

  const headers = [[
    'Hour (Local)', 'Peak kWh', 'Off-Peak kWh', 'Total kWh',
    'Energy Cost (฿)', 'Max Demand (kW)', 'Demand Rate (฿/kW)',
    'Demand Cost (฿, reference)', 'Dashboard Total (฿, reference)',
    'Avg V L1', 'Avg V L2', 'Avg V L3', 'Max Power (W)',
    'Readings', 'Updated At',
  ]];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:O1`,
    valueInputOption: 'RAW',
    resource: { values: headers },
  });
  console.log('[Sheets] ✅ สร้าง Header สรุปรายชั่วโมงสำเร็จ');
}

/** สร้าง Sheet หากยังไม่มีใน Spreadsheet */
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
    console.log(`[Sheets] ✅ สร้าง Sheet: ${sheetName}`);
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
  const sheetName     = config.googleSheets.dailySheetName;

  await ensureDailySheetHeader(sheets);

  const today = getLocalDateString();

  const valuesForRow = (r) => [
    r.date,
    parseFloat((r.peak_kwh      || 0).toFixed(4)),
    parseFloat((r.off_peak_kwh  || 0).toFixed(4)),
    parseFloat((r.total_kwh     || 0).toFixed(4)),
    parseFloat((r.total_cost    || 0).toFixed(2)),
    parseFloat((r.max_demand_kw || 0).toFixed(4)),
    parseFloat((r.demand_rate   || 0).toFixed(4)),
    parseFloat((r.demand_cost   || 0).toFixed(2)),
    parseFloat((r.dashboard_cost|| 0).toFixed(2)),
    parseFloat((r.avg_voltage_l1|| 0).toFixed(2)),
    parseFloat((r.avg_voltage_l2|| 0).toFixed(2)),
    parseFloat((r.avg_voltage_l3|| 0).toFixed(2)),
    parseFloat((r.max_power_w   || 0).toFixed(2)),
    r.reading_count || 0,
    r.last_updated || new Date().toISOString(),
  ];

  let synced = 0;
  let errors = 0;

  try {
    const dateColumn = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });
    const existingRowByDate = new Map();
    (dateColumn.data.values || []).forEach((row, index) => {
      if (index > 0 && row[0]) existingRowByDate.set(row[0], index + 1);
    });

    // แถวเก่าที่เคยซิงก์ไป EnergyData แล้วก็ต้องเติมใน DailySummary ใหม่
    // ส่วนของวันนี้จะอัปเดตทุกชั่วโมง ไม่สร้างแถวซ้ำ
    const rows = db.prepare(
      `SELECT * FROM daily_summary WHERE date <= ? ORDER BY date ASC`
    ).all(today)
      .filter((row) => row.date === today || row.synced_to_sheets === 0
        || !existingRowByDate.has(row.date))
      .sort((a, b) => a.date === today ? -1 : b.date === today ? 1
        : a.date.localeCompare(b.date))
      .slice(0, 31);

    if (rows.length === 0) {
      console.log('[Sheets] ✔️ ไม่มีรายการใหม่ที่ต้อง Sync');
      return { synced: 0, errors: 0 };
    }

    for (const row of rows) {
      const existingRowNumber = existingRowByDate.get(row.date);
      if (existingRowNumber) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A${existingRowNumber}:O${existingRowNumber}`,
          // เก็บวันที่ YYYY-MM-DD เป็นข้อความตามเดิม เพื่อหาแถววันเดิมเจอในรอบถัดไป
          valueInputOption: 'RAW',
          resource: { values: [valuesForRow(row)] },
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A2:O`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [valuesForRow(row)] },
        });
      }
    }

    // ปิดยอดเฉพาะวันก่อนหน้า; แถวของวันนี้จะถูก update ต่อในรอบ sync หน้า
    const completedIds = rows.filter((row) => row.date < today).map((row) => row.id);
    if (completedIds.length) {
      const placeholders = completedIds.map(() => '?').join(',');
      db.prepare(
        `UPDATE daily_summary SET synced_to_sheets = 1 WHERE id IN (${placeholders})`
      ).run(...completedIds);
    }

    synced = rows.length;
    console.log(`[Sheets] ✅ Sync สรุปรายวันสำเร็จ: ${synced} รายการ`);
  } catch (err) {
    errors = 1;
    console.error('[Sheets] ❌ Daily Summary Sync Error:', err.message);
  }

  return { synced, errors };
}

/**
 * ซิงก์ข้อมูลอ่านมิเตอร์ที่รวมตามชั่วโมงไปยัง HourlySummary
 * Hour หมายถึงเวลาในเขตเวลาของ Backend; Demand Cost เป็นค่าอ้างอิง
 * จึงไม่ควรนำ Demand Cost ของแต่ละชั่วโมงไปบวกเป็นยอดบิล
 */
async function syncHourlySummaryToSheets() {
  if (!config.googleSheets.spreadsheetId) {
    return { synced: 0, errors: 0 };
  }

  const authClient = await getAuthClient();
  if (!authClient) return { synced: 0, errors: 1 };

  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const spreadsheetId = config.googleSheets.spreadsheetId;
  const sheetName = config.googleSheets.hourlySheetName;
  const timeZone = process.env.TZ || 'Asia/Bangkok';
  const now = new Date();
  const localHourParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const currentHour = `${localHourParts.year}-${localHourParts.month}-${localHourParts.day} ${localHourParts.hour}:00`;
  const billingSettings = billingSettingsService.getBillingSettings();
  const demandRate = Number(billingSettings.demandRate || 0);

  const valuesForRow = (row) => {
    const peakKwh = Number(row.peak_kwh || 0);
    const offPeakKwh = Number(row.off_peak_kwh || 0);
    const energyCost = Number(row.energy_cost || 0);
    const maxDemandKw = Number(row.max_demand_kw || 0);
    const demandCost = maxDemandKw * demandRate;
    return [
      row.hour,
      parseFloat(peakKwh.toFixed(4)),
      parseFloat(offPeakKwh.toFixed(4)),
      parseFloat((peakKwh + offPeakKwh).toFixed(4)),
      parseFloat(energyCost.toFixed(2)),
      parseFloat(maxDemandKw.toFixed(4)),
      parseFloat(demandRate.toFixed(4)),
      parseFloat(demandCost.toFixed(2)),
      parseFloat((energyCost + demandCost).toFixed(2)),
      parseFloat(Number(row.avg_voltage_l1 || 0).toFixed(2)),
      parseFloat(Number(row.avg_voltage_l2 || 0).toFixed(2)),
      parseFloat(Number(row.avg_voltage_l3 || 0).toFixed(2)),
      parseFloat(Number(row.max_power_w || 0).toFixed(2)),
      Number(row.reading_count || 0),
      row.last_updated || new Date().toISOString(),
    ];
  };

  try {
    await ensureHourlySheetHeader(sheets);

    // รวมจาก raw readings ที่ยังอยู่ใน retention window; grouping ใช้ timezone
    // เดียวกับ process ของ Backend เพื่อให้ชั่วโมงตรงกับเวลาท้องถิ่นของลูกค้า
    const hourlyRows = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00', received_at, 'localtime') AS hour,
        SUM(CASE WHEN tou_period = 'peak' THEN MAX(kwh_delta, 0) ELSE 0 END) AS peak_kwh,
        SUM(CASE WHEN tou_period = 'off_peak' THEN MAX(kwh_delta, 0) ELSE 0 END) AS off_peak_kwh,
        SUM(MAX(cost_delta, 0)) AS energy_cost,
        MAX(MAX(total_w, 0)) / 1000.0 AS max_demand_kw,
        AVG(CASE WHEN l1_valid = 1 THEN l1_v END) AS avg_voltage_l1,
        AVG(CASE WHEN l2_valid = 1 THEN l2_v END) AS avg_voltage_l2,
        AVG(CASE WHEN l3_valid = 1 THEN l3_v END) AS avg_voltage_l3,
        MAX(total_w) AS max_power_w,
        COUNT(*) AS reading_count,
        MAX(received_at) AS last_updated
      FROM energy_readings
      WHERE received_at >= datetime('now', '-' || ? || ' days')
      GROUP BY hour
      ORDER BY hour ASC
    `).all(config.retention.rawDataDays);

    // At the top of the hour the preceding hour is complete. Leave the active
    // hour out so its row is not presented as a finished hourly total.
    const completedRows = hourlyRows.filter((row) => row.hour && row.hour < currentHour);
    if (completedRows.length === 0) {
      console.log('[Sheets] ✔️ ยังไม่มีข้อมูลชั่วโมงที่ปิดรอบแล้ว');
      return { synced: 0, errors: 0 };
    }

    const hourColumn = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });
    const existingRowByHour = new Map();
    (hourColumn.data.values || []).forEach((row, index) => {
      if (index > 0 && row[0]) existingRowByHour.set(row[0], index + 1);
    });

    const rowsToAppend = [];
    const rowsToUpdate = [];
    for (const row of completedRows) {
      const existingRowNumber = existingRowByHour.get(row.hour);
      if (!existingRowNumber) {
        rowsToAppend.push(valuesForRow(row));
      } else if (row.hour === completedRows[completedRows.length - 1].hour) {
        // อัปเดตชั่วโมงล่าสุดซ้ำเพื่อรองรับข้อมูลที่มาถึงช้าหลังรอบก่อน
        rowsToUpdate.push({
          range: `${sheetName}!A${existingRowNumber}:O${existingRowNumber}`,
          values: [valuesForRow(row)],
        });
      }
    }

    if (rowsToUpdate.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: { valueInputOption: 'RAW', data: rowsToUpdate },
      });
    }
    if (rowsToAppend.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A2:O`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: rowsToAppend },
      });
    }

    const synced = rowsToAppend.length + rowsToUpdate.length;
    console.log(`[Sheets] ✅ Sync สรุปรายชั่วโมงสำเร็จ: ${synced} รายการ`);
    return { synced, errors: 0 };
  } catch (err) {
    console.error('[Sheets] ❌ Hourly Summary Sync Error:', err.message);
    return { synced: 0, errors: 1 };
  }
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
  syncHourlySummaryToSheets,
  syncDailySummaryToSheets,
  syncCurrentMonthlyBillingToSheets,
  getAuthClient,
};
