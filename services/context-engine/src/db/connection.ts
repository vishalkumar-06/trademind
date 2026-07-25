import { Pool, QueryResult } from "pg";

let pool: Pool | null = null;

export async function initializeDatabase(): Promise<void> {
  if (pool) return;

  pool = new Pool({
    host: process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.DATABASE_PORT || "5432"),
    database: process.env.DATABASE_NAME || "trademind",
    user: process.env.DATABASE_USER || "trademind",
    password: process.env.DATABASE_PASSWORD || "trademind",
  });

  // Test the connection
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW()");
    console.log("✓ Database connected:", result.rows[0]);
  } finally {
    client.release();
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return pool;
}

export async function query<T>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
