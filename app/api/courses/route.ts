import { getDb, pruneIpHashes } from "@/lib/db";
import {
  cleanText,
  clientIpHash,
  isKnownTimezone,
  jsonError,
  newAdminKey,
  newCode,
  newCourseId,
  readJson,
  sha256,
} from "@/lib/server";
import { LIMITS } from "@/lib/shared";

// Generous enough for a whole staff training session on one school network.
const MAX_COURSES_PER_IP_PER_HOUR = Number(process.env.MAX_COURSES_PER_IP_PER_HOUR ?? 30);

// Create a course. No account needed: the response contains a private admin key
// that is shown to the teacher once and stored only as a hash.
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request.");

  const name = cleanText(body.name, LIMITS.courseName);
  if (!name) return jsonError(400, "Please enter a course name.");
  const instructor = cleanText(body.instructor, LIMITS.instructor) ?? "";
  const size = Number(body.classSize);
  const classSize = Number.isInteger(size) && size >= 1 && size <= 2000 ? size : null;

  const db = await getDb();
  void pruneIpHashes(db);
  const timezone = (await isKnownTimezone(body.timezone)) ? (body.timezone as string) : "UTC";
  const ipHash = await clientIpHash(req);

  const recent = await db.query<{ n: number }>(
    `select count(*)::int as n from courses
     where creator_ip_hash = $1 and created_at > now() - interval '1 hour'`,
    [ipHash],
  );
  if (recent[0].n >= MAX_COURSES_PER_IP_PER_HOUR) {
    return jsonError(429, "Too many courses created from this network. Please try again in an hour.");
  }

  const id = newCourseId();
  const key = newAdminKey();

  // Codes are random; retry on the rare collision instead of failing the teacher.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newCode();
    const rows = await db.query<{ code: string }>(
      `insert into courses (id, code, name, instructor, admin_key_hash, timezone, class_size, creator_ip_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (code) do nothing
       returning code`,
      [id, code, name, instructor, sha256(key), timezone, classSize, ipHash],
    );
    if (rows[0]) {
      return Response.json({ id, code, key, name }, { status: 201 });
    }
  }
  return jsonError(503, "Couldn't create the course. Please try again.");
}
