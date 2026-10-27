
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
async function main() {
  const databaseDir = path.resolve(__dirname, '../../database');
  const baseSchema = fs.readFileSync(path.join(databaseDir, 'schema.sql'), 'utf8');
  await pool.query(baseSchema);
  const dir = path.join(databaseDir, 'migrations');
  const files = fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const old = (await pool.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [file])).rows[0];
    if (old) {
      if (old.checksum !== checksum) throw new Error(`Migration ${file} changed after being applied; create a new migration instead.`);
      console.log(`skip ${file}`); continue;
    }
    const client = await pool.connect();
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [file, checksum]);
      console.log(`applied ${file}`);
    } catch (e) { throw e; }
    finally { client.release(); }
  }
}
main().catch(e => { console.error('Migration failed:', e.message); process.exitCode = 1; }).finally(() => pool.end());
