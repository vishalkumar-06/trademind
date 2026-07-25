import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { initializeDatabase, query, closeDatabase } from "../db/connection.js";

const __dirname = join(fileURLToPath(import.meta.url), "..");

export async function runMigrations(): Promise<void> {
  console.log("🔄 Running database migrations...");

  await initializeDatabase();

  const schemaPath = join(__dirname, "../db/schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");

  // Split by statements and execute
  const statements = schemaSql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  for (const statement of statements) {
    try {
      await query(statement);
      console.log("✓", statement.substring(0, 60) + "...");
    } catch (error) {
      console.error("✗ Migration error:", error);
      throw error;
    }
  }

  console.log("✓ All migrations completed successfully");
  await closeDatabase();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}
