import { getDb, pruneIpHashes } from "@/lib/db";
import { cleanText, clientIpHash, jsonError, readJson, sha256 } from "@/lib/server";
import { LIMITS, isRealDate, isValidCode, normalizeCode } from "@/lib/shared";

// A whole classroom often shares one campus Wi-Fi IP, so this is a ceiling against
// scripted spam, not a per-student limit. Per-student dedupe uses the device id.
// When the teacher gave a class size, the ceiling tightens to twice that (at least 60).
const MAX_PER_IP_PER_SESSION = Number(process.env.MAX_RESPONSES_PER_IP ?? 400);

/**
 * Create or update this device's response for a class day.
 * The first tap on a rating creates the row; pace and comment update the same row.
 * Omitted fields keep their previous value; an empty comment string clears the comment.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request.");

  const code = normalizeCode(String(body.code ?? ""));
  const deviceId = String(body.deviceId ?? "");
  if (!isValidCode(code)) return jsonError(400, "Invalid class code.");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) return jsonError(400, "Invalid device.");

  const rating = body.rating == null ? null : Number(body.rating);
  const pace = body.pace == null ? null : Number(body.pace);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5))
    return jsonError(400, "Invalid rating.");
  if (pace !== null && !(Number.isInteger(pace) && pace >= -1 && pace <= 1))
    return jsonError(400, "Invalid pace.");
  const comment = cleanText(body.comment, LIMITS.comment);
  const clearComment = typeof body.comment === "string" && comment === null;
  if (rating === null && pace === null && comment === null && !clearComment)
    return jsonError(400, "Nothing to save.");

  // The class day the form was opened on. Lets a form opened before midnight still count for that
  // class after midnight. Anything older than yesterday is refused below rather than misfiled.
  const claimedDate = isRealDate(body.sessionDate) ? body.sessionDate : null;

  // Salted with the class code so the same phone can't be linked across courses.
  const deviceHash = sha256(`${code}:${deviceId}`);

  const db = await getDb();
  void pruneIpHashes(db);

  // Only clearing a comment: update an existing answer, never create an empty one.
  if (rating === null && pace === null && comment === null) {
    const cleared = await db.query<{ sessionDate: string }>(
      `update responses r set comment = null, updated_at = now()
       from courses c
       where r.course_id = c.id and c.code = $1 and c.is_open and r.device_hash = $3
         and r.session_date = case
           when $2::date is null or $2::date >= (now() at time zone c.timezone)::date
             then (now() at time zone c.timezone)::date
           when $2::date = (now() at time zone c.timezone)::date - 1 then $2::date end
       returning r.session_date::text as "sessionDate"`,
      [code, claimedDate, deviceHash],
    );
    return Response.json(
      { ok: true, sessionDate: cleared[0]?.sessionDate ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const ipHash = await clientIpHash(req);
  const rows = await db.query<{ sessionDate: string }>(
    `with c as (
       select id, class_size, (now() at time zone timezone)::date as today
       from courses where code = $1 and is_open
     ),
     s as (
       select id, class_size,
              case when $2::date is null or $2::date >= today then today
                   when $2::date = today - 1 then $2::date end as d
       from c
     )
     insert into responses (course_id, session_date, device_hash, ip_hash, rating, pace, comment)
     select s.id, s.d, $3, $4, $5, $6, $7
     from s
     where s.d is not null
       and ((select count(*) from responses r
             where r.course_id = s.id and r.session_date = s.d and r.ip_hash = $4)
              < case when s.class_size is null then $8::int else least($8::int, greatest(60, s.class_size * 2)) end
            or exists (select 1 from responses r
                       where r.course_id = s.id and r.session_date = s.d and r.device_hash = $3))
     on conflict (course_id, session_date, device_hash) do update set
       rating = coalesce(excluded.rating, responses.rating),
       pace = coalesce(excluded.pace, responses.pace),
       comment = case when $9::boolean then null else coalesce(excluded.comment, responses.comment) end,
       updated_at = now()
     returning session_date::text as "sessionDate"`,
    [code, claimedDate, deviceHash, ipHash, rating, pace, comment, MAX_PER_IP_PER_SESSION, clearComment],
  );

  if (rows[0]) {
    return Response.json(
      { ok: true, sessionDate: rows[0].sessionDate },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Nothing written: figure out why so the student sees a useful message.
  const course = await db.query<{ isOpen: boolean; stale: boolean }>(
    `select is_open as "isOpen",
            coalesce($2::date < (now() at time zone timezone)::date - 1, false) as stale
     from courses where code = $1`,
    [code, claimedDate],
  );
  if (!course[0]) return jsonError(404, "This class code doesn't exist.");
  if (!course[0].isOpen) return jsonError(403, "Your teacher has paused feedback for this class.");
  if (course[0].stale)
    return jsonError(410, "Feedback for that class has closed. Reload the page to answer for today's class.");
  return jsonError(429, "Too many responses from this network. Please try again later.");
}
