import '../config/load-env.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL не задан');

async function main(): Promise<void> {
  const client = postgres(url as string, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  await client.end();
  console.log('Миграции применены');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
