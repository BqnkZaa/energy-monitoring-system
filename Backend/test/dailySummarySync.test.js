'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('daily sync updates the same dated row without duplicating it', async () => {
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'Asia/Bangkok';
  process.env.GOOGLE_SPREADSHEET_ID = 'test-spreadsheet';
  process.env.GOOGLE_DAILY_SHEET_NAME = 'DailySummary';
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = __filename;

  const { google } = require('googleapis');
  const originalGoogleAuth = google.auth.GoogleAuth;
  const originalSheets = google.sheets;
  const rows = [];
  const writes = [];
  let sheetExists = false;
  const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const date = `${today.year}-${today.month}-${today.day}`;
  const previousDay = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(Date.now() - 86400000)).map((part) => [part.type, part.value]));
  const oldDate = `${previousDay.year}-${previousDay.month}-${previousDay.day}`;
  const dailyRow = {
    id: 1, date, synced_to_sheets: 0, total_kwh: 1.5, total_cost: 5,
    max_demand_kw: 2, demand_rate: 132.93, demand_cost: 265.86,
    dashboard_cost: 270.86, reading_count: 1, last_updated: new Date().toISOString(),
  };
  const alreadySyncedOldRow = {
    ...dailyRow, id: 2, date: oldDate, synced_to_sheets: 1,
  };
  const databaseModulePath = require.resolve('../src/database/db');
  const previousDatabaseModule = require.cache[databaseModulePath];
  require.cache[databaseModulePath] = {
    id: databaseModulePath,
    filename: databaseModulePath,
    loaded: true,
    exports: {
      prepare: (sql) => ({
        all: () => sql.includes('FROM daily_summary')
          ? [alreadySyncedOldRow, dailyRow] : [],
        run: () => ({}),
        get: () => null,
      }),
    },
  };

  google.auth.GoogleAuth = class {
    async getClient() { return {}; }
  };
  google.sheets = () => ({
    spreadsheets: {
      get: async () => ({
        data: { sheets: sheetExists ? [{ properties: { title: 'DailySummary' } }] : [] },
      }),
      batchUpdate: async () => { sheetExists = true; },
      values: {
        get: async ({ range }) => ({
          data: { values: range.endsWith('!A1:A1')
            ? (rows[0] ? [[rows[0][0]]] : [])
            : rows.map((row) => [row[0]]) },
        }),
        append: async ({ range, valueInputOption, resource }) => {
          writes.push({ range, valueInputOption });
          if (range.endsWith('!A1')) rows[0] = resource.values[0];
          else rows.push(resource.values[0]);
        },
        update: async ({ range, valueInputOption, resource }) => {
          writes.push({ range, valueInputOption });
          const rowNumber = Number(range.match(/!A(\d+):O/)[1]);
          rows[rowNumber - 1] = resource.values[0];
        },
      },
    },
  });

  try {
    const { syncDailySummaryToSheets } = require('../src/services/sheetsService');
    assert.deepEqual(await syncDailySummaryToSheets(), { synced: 2, errors: 0 });
    assert.equal(rows.length, 3);
    assert.equal(rows[1][0], date);
    assert.equal(rows[1][8], 270.86);
    assert.equal(rows[2][0], oldDate);

    dailyRow.total_cost = 7;
    dailyRow.dashboard_cost = 272.86;
    assert.deepEqual(await syncDailySummaryToSheets(), { synced: 1, errors: 0 });
    assert.equal(rows.length, 3);
    assert.equal(rows[1][0], date);
    assert.equal(rows[1][8], 272.86);
    assert.equal(writes.filter((write) => write.valueInputOption === 'RAW').length, 3);
  } finally {
    google.auth.GoogleAuth = originalGoogleAuth;
    google.sheets = originalSheets;
    if (previousDatabaseModule) require.cache[databaseModulePath] = previousDatabaseModule;
    else delete require.cache[databaseModulePath];
  }
});
