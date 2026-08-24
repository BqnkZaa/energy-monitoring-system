/**
 * ============================================================
 *  Billing Settings Service
 *  - เก็บอัตราค่าไฟที่แก้ผ่าน Dashboard ลง SQLite
 *  - ใช้เป็นค่าเดียวกันสำหรับ TOU, Demand และ Google Sheets
 * ============================================================
 */
'use strict';

const db = require('../database/db');

const stmtGetSettings = db.prepare(`
  SELECT peak_rate, off_peak_rate, demand_rate, ft_rate,
         service_charge, vat_rate, updated_at
  FROM billing_settings WHERE id = 1
`);

const stmtUpdateSettings = db.prepare(`
  UPDATE billing_settings
  SET peak_rate = @peakRate,
      off_peak_rate = @offPeakRate,
      demand_rate = @demandRate,
      ft_rate = @ftRate,
      service_charge = @serviceCharge,
      vat_rate = @vatRate,
      updated_at = @updatedAt
  WHERE id = 1
`);

function mapSettings(row) {
  return {
    peakRate: row.peak_rate,
    offPeakRate: row.off_peak_rate,
    demandRate: row.demand_rate,
    ftRate: row.ft_rate,
    serviceCharge: row.service_charge,
    vatRate: row.vat_rate,
    updatedAt: row.updated_at,
  };
}

function getBillingSettings() {
  return mapSettings(stmtGetSettings.get());
}

function toNumber(value, label, { min, max }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} ต้องเป็นตัวเลขระหว่าง ${min} ถึง ${max}`);
  }
  return number;
}

function updateBillingSettings(input) {
  const current = getBillingSettings();
  const next = {
    peakRate: toNumber(input.peakRate ?? current.peakRate, 'Peak rate', { min: 0, max: 100 }),
    offPeakRate: toNumber(input.offPeakRate ?? current.offPeakRate, 'Off-Peak rate', { min: 0, max: 100 }),
    demandRate: toNumber(input.demandRate ?? current.demandRate, 'Demand rate', { min: 0, max: 10000 }),
    ftRate: toNumber(input.ftRate ?? current.ftRate, 'Ft rate', { min: -100, max: 100 }),
    serviceCharge: toNumber(input.serviceCharge ?? current.serviceCharge, 'Service charge', { min: 0, max: 100000 }),
    vatRate: toNumber(input.vatRate ?? current.vatRate, 'VAT rate', { min: 0, max: 1 }),
    updatedAt: new Date().toISOString(),
  };

  stmtUpdateSettings.run(next);
  return getBillingSettings();
}

module.exports = { getBillingSettings, updateBillingSettings };
