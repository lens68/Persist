import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SEED_SALES = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const lmY = lastMonthDate.getFullYear();
  const lmM = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
  return [
    { product_name: 'Widget A', amount: 12000, units: 400, sold_at: `${lmY}-${lmM}-15` },
    { product_name: 'Widget B', amount: 8500, units: 320, sold_at: `${lmY}-${lmM}-20` },
    { product_name: 'Widget C', amount: 15000, units: 500, sold_at: `${y - 1}-11-10` },
    { product_name: 'Gadget X', amount: 22000, units: 110, sold_at: `${y}-${m}-05` },
    { product_name: 'Gadget Y', amount: 9800, units: 245, sold_at: `${y}-${m}-01` },
  ];
})();

export function initSalesFixtureDb(databaseUrl: string): Database.Database {
  const raw = databaseUrl.replace(/^file:/, '');
  const isMemory = raw === ':memory:' || raw.startsWith(':memory:');
  const filePath = isMemory ? raw : resolve(raw);
  if (!isMemory) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const sqlite = new Database(filePath, isMemory ? undefined : { readonly: false });
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      amount REAL NOT NULL,
      units INTEGER NOT NULL,
      sold_at TEXT NOT NULL
    );
  `);

  const count = sqlite.prepare('SELECT COUNT(*) AS c FROM sales').get() as { c: number };
  if (count.c === 0) {
    const insert = sqlite.prepare(
      'INSERT INTO sales (product_name, amount, units, sold_at) VALUES (?, ?, ?, ?)',
    );
    for (const row of SEED_SALES) {
      insert.run(row.product_name, row.amount, row.units, row.sold_at);
    }
  }

  return sqlite;
}

export function openSalesFixtureReadOnly(databaseUrl: string): Database.Database {
  const raw = databaseUrl.replace(/^file:/, '');
  const isMemory = raw === ':memory:' || raw.startsWith(':memory:');
  if (isMemory) {
    return initSalesFixtureDb(databaseUrl);
  }
  const filePath = resolve(raw);
  initSalesFixtureDb(databaseUrl);
  return new Database(filePath, { readonly: true });
}
