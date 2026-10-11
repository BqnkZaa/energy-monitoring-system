'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('hourly sync appends missing closed hours, updates the latest, and skips the active hour', async () => {
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'Asia/Bangkok';
  process.env.GOOGLE_SPREADSHEET_ID = 'test-spreadsheet';
  process.env.GOOGLE_HOURLY_SHEET_NAME = 'HourlySummary';
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = __filename;

  const localHourKey = (date) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:00`;
  };

  const oldHour = localHourKey(new Date(Date.now() - 2 * 60 * 60 * 1000));
  const latestClosedHour = localHourKey(new Date(Date.now() - 60 * 60 * 1000));
  const activeHour = localHourKey(new Date());
  const aggregates = [
    {
      hour: oldHour, peak_kwh: 1, off_peak_kwh: 0, energy_cost: 4.1,
      max_demand_kw: 1.2, avg_voltage_l1: 220, avg_voltage_l2: 221,
      avg_voltage_l3: 222, max_power_w: 1200, reading_count: 30,
      last_updated: `${oldHour}:59`,
    },
    {
      hour: latestClosedHour, peak_kwh: 0, off_peak_kwh: 0.5, energy_cost: 1.29,
      max_demand_kw: 2, avg_voltage_l1: 223, avg_voltage_l2: 224,
      avg_voltage_l3: 225, max_power_w: 2000, reading_count: 30,
      last_updated: `${latestClosedHour}:59`,
    },
    {
      hour: activeHour, peak_kwh: 0, off_peak_kwh: 0.1, energy_cost: 0.26,
      max_demand_kw: 0.5, avg_voltage_l1: 226, avg_voltage_l2: 227,
      avg_voltage_l3: 228, max_power_w: 500, reading_count: 5,
      last_updated: new Date().toISOString(),
    },
  ];
  const sheetRows = [['Hour (Local)'], [latestClosedHour]];
  const writes = [];
  let sheetExists = false;
  let headerExists = false;

  const databaseModulePath = require.resolve('../src/database/db');
  const previousDatabaseModule = require.cache[databaseModulePath];
  require.cache[databaseModulePath] = {
    id: databaseModulePath,
    filename: databaseModulePath,
    loaded: true,
    exports: {
      prepare: (sql) => ({
        all: () => sql.includes('FROM energy_readings') ? aggregates : [],
        get: () => ({
          peak_rate: 4.1025, off_peak_rate: 2.5849, demand_rate: 132.93,
          ft_rate: 0, service_charge: 312.24, vat_rate: 0.07,
          site_latitude: null, site_longitude: null, updated_at: new Date().toISOString(),
        }),
        run: () => ({}),
      }),
    },
  };

  const { google } = require('googleapis');
  const originalGoogleAuth = google.auth.GoogleAuth;
  const originalSheets = google.sheets;
  google.auth.GoogleAuth = class {
    async getClient() { return {}; }
  };
  google.sheets = () => ({
    spreadsheets: {
      get: async () => ({
        data: { sheets: sheetExists ? [{ properties: { title: 'HourlySummary' } }] : [] },
      }),
      batchUpdate: async () => { sheetExists = true; },
      values: {
        get: async ({ range }) => ({
          data: { values: range.endsWith('!A1:A1')
            ? (headerExists ? [['Hour (Local)']] : [])
            : sheetRows.map((row) => [row[0]]) },
        }),
        update: async ({ range, resource }) => {
          writes.push({ type: 'update-header', range });
          if (range.endsWith('!A1:O1')) {
            headerExists = true;
            sheetRows[0] = resource.values[0];
          }
        },
        batchUpdate: async ({ resource }) => {
          writes.push({ type: 'batchUpdate', data: resource.data });
          for (const update of resource.data) {
            const rowNumber = Number(update.range.match(/!A(\d+):O/)[1]);
            sheetRows[rowNumber - 1] = [
              update.values[0][0],
              ...update.values[0].slice(1),
            ];
          }
        },
        append: async ({ resource }) => {
          writes.push({ type: 'append', rows: resource.values });
          sheetRows.push(...resource.values);
        },
      },
    },
  });

  try {
    const { syncHourlySummaryToSheets } = require('../src/services/sheetsService');
    assert.deepEqual(await syncHourlySummaryToSheets(), { synced: 2, errors: 0 });
    assert.equal(sheetRows.length, 3);
    assert.equal(sheetRows[1][0], latestClosedHour);
    assert.equal(sheetRows[1][7], 265.86);
    assert.equal(sheetRows[1][8], 267.15);
    assert.equal(sheetRows[2][0], oldHour);
    assert.equal(sheetRows.some((row) => row[0] === activeHour), false);
    assert.equal(writes.filter((write) => write.type === 'update-header').length, 1);
    assert.equal(writes.filter((write) => write.type === 'batchUpdate').length, 1);
    assert.equal(writes.filter((write) => write.type === 'append').length, 1);

    aggregates[1].energy_cost = 2;
    assert.deepEqual(await syncHourlySummaryToSheets(), { synced: 1, errors: 0 });
    assert.equal(sheetRows.length, 3);
    assert.equal(sheetRows[1][4], 2);
  } finally {
    google.auth.GoogleAuth = originalGoogleAuth;
    google.sheets = originalSheets;
    if (previousDatabaseModule) require.cache[databaseModulePath] = previousDatabaseModule;
    else delete require.cache[databaseModulePath];
  }
});
