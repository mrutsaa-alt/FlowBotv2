
require('dotenv').config();
const pool = require('../src/config/db');
const { encryptToken, isEncrypted } = require('../src/services/tokenCrypto');
async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.TOKEN_ENCRYPTION_KEY)
    throw new Error('Set TOKEN_ENCRYPTION_KEY before migrating provider tokens.');
  const rows = (await pool.query('SELECT id,access_token FROM channels WHERE access_token IS NOT NULL')).rows;
  let changed = 0;
  for (const row of rows) {
    if (isEncrypted(row.access_token)) continue;
    await pool.query('UPDATE channels SET access_token=$1 WHERE id=$2',[encryptToken(row.access_token),row.id]);
    changed++;
  }
  console.log(`Encrypted ${changed} legacy provider token(s).`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
