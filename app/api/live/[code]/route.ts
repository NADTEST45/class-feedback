import { getDb } from "@/lib/db";
import { jsonError } from "@/lib/server";
import { isValidCode, normalizeCode } from "@/lib/shared";

// Public, deliberately minimal: the projector view only needs today's response count.
export async function GET(_req: Request, ctx: RouteContext<"/api/live/[code]">) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return jsonError(404, "Not found.");
  const db = await getDb();
  const rows = await db.query<{ count: number; isOpen: boolean }>(
    `select c.is_open as "isOpen",
            (select count(*) from responses r
             where r.course_id = c.id
               and r.session_date = (now() at time zone c.timezone)::date)::int as count
     from courses c where c.code = $1`,
    [code],
  );
  if (!rows[0]) return jsonError(404, "Not found.");
  return Response.json(rows[0], { headers: { "Cache-Control": "no-store" } });
}
