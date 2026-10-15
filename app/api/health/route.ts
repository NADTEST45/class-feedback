import { connection } from "next/server";
import { getDb } from "@/lib/db";

// For uptime checks and the README's "is it working?" step.
export async function GET() {
  // Without this, `next build` prerenders the route and opens the live database.
  await connection();
  try {
    const db = await getDb();
    await db.query("select 1");
    return Response.json(
      { ok: true, database: process.env.DATABASE_URL ? "postgres" : "embedded" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Database unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
