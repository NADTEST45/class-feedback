import { getDb } from "@/lib/db";
import { cleanText, courseFromAuth, jsonError, readJson } from "@/lib/server";
import {
  DEFAULT_OPEN_QUESTION,
  LIMITS,
  isRealDate,
  type DashboardData,
  type ResponseRow,
  type SessionSummary,
} from "@/lib/shared";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAUTHORIZED = "This dashboard link isn't valid. Check that you copied the whole link.";

export async function GET(req: Request) {
  const course = await courseFromAuth(req);
  if (!course) return jsonError(401, UNAUTHORIZED);
  const db = await getDb();

  const sessions = await db.query<SessionSummary>(
    `select session_date::text as date,
            count(*)::int as responses,
            round(avg(rating)::numeric, 2)::float8 as "avgRating",
            count(*) filter (where rating <= 2)::int as struggling,
            count(*) filter (where pace = -1)::int as slow,
            count(*) filter (where pace = 0)::int as "right",
            count(*) filter (where pace = 1)::int as fast,
            count(comment)::int as comments
     from responses where course_id = $1
     group by session_date order by session_date desc limit 400`,
    [course.id],
  );

  // Default to today if anything came in today, else the most recent class.
  const requested = new URL(req.url).searchParams.get("date");
  if (requested !== null && !isRealDate(requested)) return jsonError(400, "Invalid date.");
  const selectedDate =
    requested ?? (sessions.find((s) => s.date === course.today) ?? sessions[0])?.date ?? course.today;

  const responses = await db.query<ResponseRow>(
    `select id, rating, pace, comment,
            to_char(updated_at at time zone $3, 'HH24:MI') as time
     from responses where course_id = $1 and session_date = $2::date
     order by updated_at desc limit 2000`,
    [course.id, selectedDate, course.timezone],
  );

  const distribution = [0, 0, 0, 0, 0];
  for (const r of responses) if (r.rating) distribution[r.rating - 1]++;

  const data: DashboardData = { course, sessions, selectedDate, distribution, responses };
  return Response.json(data, { headers: NO_STORE });
}

export async function PATCH(req: Request) {
  const course = await courseFromAuth(req);
  if (!course) return jsonError(401, UNAUTHORIZED);
  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request.");

  const sets: string[] = [];
  const params: unknown[] = [course.id];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if ("name" in body) {
    const name = cleanText(body.name, LIMITS.courseName);
    if (!name) return jsonError(400, "Course name can't be empty.");
    set("name", name);
  }
  if ("instructor" in body) set("instructor", cleanText(body.instructor, LIMITS.instructor) ?? "");
  if ("openQuestion" in body)
    set("open_question", cleanText(body.openQuestion, LIMITS.openQuestion) ?? DEFAULT_OPEN_QUESTION);
  if ("classSize" in body) {
    const n = Number(body.classSize);
    set("class_size", body.classSize && Number.isInteger(n) && n >= 1 && n <= 2000 ? n : null);
  }
  if ("isOpen" in body) set("is_open", body.isOpen === true);
  if (!sets.length) return jsonError(400, "Nothing to update.");

  const db = await getDb();
  await db.query(`update courses set ${sets.join(", ")} where id = $1`, params);
  return Response.json({ ok: true }, { headers: NO_STORE });
}

// DELETE /api/manage?response=<id> removes one response (spam or abuse);
// DELETE /api/manage with no parameter deletes the whole course.
export async function DELETE(req: Request) {
  const course = await courseFromAuth(req);
  if (!course) return jsonError(401, UNAUTHORIZED);
  const db = await getDb();
  const responseParam = new URL(req.url).searchParams.get("response");
  if (responseParam !== null) {
    const id = Number(responseParam);
    // responses.id is a Postgres integer.
    if (!/^\d{1,10}$/.test(responseParam) || id < 1 || id > 2_147_483_647)
      return jsonError(400, "Invalid response.");
    await db.query(`delete from responses where id = $1 and course_id = $2`, [id, course.id]);
    return Response.json({ ok: true }, { headers: NO_STORE });
  }
  await db.query(`delete from courses where id = $1`, [course.id]);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
