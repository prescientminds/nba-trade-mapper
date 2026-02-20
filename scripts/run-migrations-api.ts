/**
 * Run SQL migrations via Supabase Management API.
 *
 * Usage: SUPABASE_ACCESS_TOKEN=xxx npx tsx scripts/run-migrations-api.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'izvnmsrjygshtperrwqk';
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

if (!ACCESS_TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN environment variable');
  process.exit(1);
}

async function runSQL(sql: string, label: string): Promise<boolean> {
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      // Check for "already exists" which is fine
      if (text.includes('already exists') || text.includes('duplicate')) {
        console.log(`  ${label}: Already applied (skipped)`);
        return true;
      }
      console.error(`  ${label}: Error - ${text}`);
      return false;
    }

    console.log(`  ${label}: Success`);
    return true;
  } catch (err) {
    console.error(`  ${label}: ${err}`);
    return false;
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  console.log(`Running ${files.length} migrations...\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    await runSQL(sql, file);
  }

  // Verify tables exist
  console.log('\nVerifying...');
  const checkResult = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('player_seasons', 'player_contracts', 'player_accolades') ORDER BY table_name",
    }),
  });
  const tables = await checkResult.json();
  console.log('Tables found:', JSON.stringify(tables));
  console.log('\nDone!');
}

main().catch(console.error);
