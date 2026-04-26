/**
 * Reset every Postgres sequence in the public schema to MAX(owning column) + 1.
 *
 * Required after `pg_restore --data-only`: the dump replays INSERTs but the
 * sequences stay at their initial value, so the next app insert collides with
 * existing rows. Idempotent — safe to run multiple times.
 *
 * Usage:  npx tsx scripts/reset-sequences.ts
 *
 * Reads DATABASE_URL from .env via dotenv. Run AFTER pointing DATABASE_URL at
 * Scaleway and AFTER restoring the data.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeqOwner {
  schema: string;
  table: string;
  column: string;
  sequence: string;
}

async function main() {
  // Find every sequence in `public` and the column it owns. `pg_get_serial_sequence`
  // returns the qualified name when a column is backed by a sequence.
  const owners = await prisma.$queryRawUnsafe<SeqOwner[]>(`
    SELECT
      n.nspname            AS schema,
      c.relname            AS table,
      a.attname            AS column,
      pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS sequence
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) IS NOT NULL
  `);

  if (owners.length === 0) {
    console.log("No sequences found in public schema. Nothing to reset.");
    return;
  }

  console.log(`Resetting ${owners.length} sequence(s)…`);
  for (const o of owners) {
    const stmt = `
      SELECT setval(
        '${o.sequence}',
        COALESCE((SELECT MAX("${o.column}") FROM "${o.schema}"."${o.table}"), 0) + 1,
        false
      )
    `;
    const [{ setval }] = await prisma.$queryRawUnsafe<{ setval: bigint }[]>(stmt);
    console.log(`  ${o.table}.${o.column} → ${setval}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
