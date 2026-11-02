import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import zones from "../lib/time-zones.json";
it("uses zone names recognized by PostgreSQL validation", async () => {
  const db = new PGlite();
  try {
    const { rows } = await db.query<{ name: string }>(
      "select name from pg_catalog.pg_timezone_names",
    );
    const names = new Set(rows.map((r) => r.name));
    expect([...zones, "UTC"].filter((z) => !names.has(z))).toEqual([]);
  } finally {
    await db.close();
  }
}, 20000);
