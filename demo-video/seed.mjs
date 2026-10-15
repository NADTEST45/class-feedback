// Seeds the demo database with one course and ~10 past classes of history.
// Uses the app's own db module (Node strips the TypeScript types), so the schema always matches.
import { createHash, randomBytes } from "node:crypto";
import { DEMO } from "./demo-config.mjs";

// Always the throwaway embedded database, even if DATABASE_URL is set in this shell.
delete process.env.DATABASE_URL;
process.env.PGLITE_DIR = DEMO.dataDir;
const { getDb } = await import("../lib/db.ts");
const db = await getDb();

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Deterministic randomness so every recording tells the same story.
let seed = 20261014;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function ratingsFor(avg, n) {
  // Spread around the target average, clamped to 1..5, then nudge to hit it.
  const out = Array.from({ length: n }, () =>
    Math.min(5, Math.max(1, Math.round(avg + (rand() + rand() + rand() - 1.5) * 1.6))),
  );
  for (let guard = 0; guard < 200; guard++) {
    const cur = out.reduce((a, b) => a + b, 0) / n;
    if (Math.abs(cur - avg) < 0.04) break;
    const i = Math.floor(rand() * n);
    out[i] = Math.min(5, Math.max(1, out[i] + (cur < avg ? 1 : -1)));
  }
  return out;
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

// Mon/Wed/Fri classes before today.
const sessions = [];
for (let d = new Date(`${today}T12:00:00Z`); sessions.length < 10; ) {
  d = new Date(d.getTime() - 864e5);
  if ([1, 3, 5].includes(d.getUTCDay())) sessions.unshift(d.toISOString().slice(0, 10));
}
const averages = [3.1, 3.3, 2.8, 3.4, 3.6, 3.5, 3.8, 3.4, 3.9, 4.0];
const fastShare = [0.25, 0.2, 0.4, 0.2, 0.15, 0.2, 0.1, 0.25, 0.1, 0.1];
const oldComments = [
  "Can you post the slides?",
  "Still confused about pointers vs references",
  "The linked list diagram helped a lot",
  "Why is insertion O(1) but search O(n)?",
  "More practice problems please",
  "How does the hash function handle collisions?",
];

await db.query("delete from courses where id = $1 or code = $2", [DEMO.courseId, DEMO.code]);
await db.query(
  `insert into courses (id, code, name, instructor, admin_key_hash, timezone, class_size, created_at)
   values ($1, $2, $3, $4, $5, $6, $7, now() - interval '30 days')`,
  [DEMO.courseId, DEMO.code, DEMO.courseName, DEMO.instructor, sha256(DEMO.adminKey), tz, DEMO.classSize],
);

let total = 0;
for (const [i, date] of sessions.entries()) {
  const n = 30 + Math.floor(rand() * 10);
  const ratings = ratingsFor(averages[i], n);
  for (const rating of ratings) {
    const r = rand();
    const pace = r < fastShare[i] ? 1 : r < fastShare[i] + 0.1 ? -1 : 0;
    const comment = rand() < 0.22 ? oldComments[Math.floor(rand() * oldComments.length)] : null;
    const minute = 50 + Math.floor(rand() * 9);
    await db.query(
      `insert into responses (course_id, session_date, device_hash, rating, pace, comment, created_at, updated_at)
       values ($1, $2::date, $3, $4, $5, $6,
               (($2 || ' 10:' || $7)::timestamp at time zone $8),
               (($2 || ' 10:' || $7)::timestamp at time zone $8))`,
      [DEMO.courseId, date, randomBytes(16).toString("hex"), rating, pace, comment, String(minute), tz],
    );
    total++;
  }
}
await db.query("checkpoint");
console.log(`Seeded ${DEMO.code}: ${sessions.length} past classes, ${total} responses (${sessions[0]} → ${sessions.at(-1)}), tz ${tz}`);
process.exit(0);
