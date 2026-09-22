import pg from 'pg';

// Postgres returns bigint (price_minor, count(*)) as a string by default, to avoid precision loss.
// The schema caps price_minor at Number.MAX_SAFE_INTEGER, so converting to a number is safe.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

export const pool = new pg.Pool({
  connectionString,
  // Supabase requires TLS. Its certificate is not in Node's default CA bundle, so the chain is
  // not verified; the connection is still encrypted.
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
});
