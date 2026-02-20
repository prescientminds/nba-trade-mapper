/**
 * Run SQL migrations against Supabase using direct postgres connection.
 *
 * Usage: npx tsx scripts/run-migrations.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Extract the project ref from URL
const ref = new URL(SUPABASE_URL).hostname.split('.')[0];

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  console.log(`Found ${files.length} migration files.\n`);

  // Try connecting via Supabase pooler with service role key as password
  // This works with Supavisor transaction pooler
  let sql: ReturnType<typeof postgres>;

  try {
    sql = postgres({
      host: `aws-0-us-east-1.pooler.supabase.com`,
      port: 6543,
      database: 'postgres',
      username: `postgres.${ref}`,
      password: SERVICE_ROLE_KEY,
      ssl: 'require',
      connect_timeout: 10,
    });

    // Test connection
    await sql`SELECT 1 as test`;
    console.log('Connected to Supabase database via pooler.\n');
  } catch (e1) {
    console.log('Pooler connection failed, trying direct connection...');
    try {
      sql = postgres({
        host: `db.${ref}.supabase.co`,
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: SERVICE_ROLE_KEY,
        ssl: 'require',
        connect_timeout: 10,
      });
      await sql`SELECT 1 as test`;
      console.log('Connected to Supabase database directly.\n');
    } catch (e2) {
      console.error('Could not connect to database.');
      console.error('Please run migrations manually in Supabase SQL Editor:');
      console.error(`https://supabase.com/dashboard/project/${ref}/sql/new\n`);
      for (const file of files) {
        console.log(`  - database/migrations/${file}`);
      }
      process.exit(1);
    }
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`Running: ${file}`);
    try {
      await sql.unsafe(content);
      console.log(`  ✓ Success\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Ignore "already exists" errors
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        console.log(`  ✓ Already applied (skipped)\n`);
      } else {
        console.error(`  ✗ Error: ${msg}\n`);
      }
    }
  }

  await sql.end();
  console.log('Done!');
}

main().catch(console.error);
