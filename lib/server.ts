import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { getDb } from "./db";
import { CODE_ALPHABET, CODE_LENGTH, type CourseInfo } from "./shared";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newCourseId(): string {
  return randomBytes(9).toString("base64url");
}

/** The teacher's private key. Only its hash is stored. */
export function newAdminKey(): string {
  return randomBytes(24).toString("base64url");
}

export function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Valid for both Node and Postgres (they don't agree on every name, e.g. "+05:30"). */
export async function isKnownTimezone(tz: unknown): Promise<boolean> {
  if (typeof tz !== "string" || tz.length > 64 || !isValidTimezone(tz)) return false;
  const db = await getDb();
  return (await db.query(`select 1 from pg_timezone_names where name = $1`, [tz])).length > 0;
}

/**
 * The client's IP as seen by our own proxy. Clients can put anything in X-Forwarded-For,
 * so only the entry appended by the nearest trusted proxy counts (TRUSTED_PROXY_HOPS, default 1).
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (process.env.VERCEL && real) return real; // Vercel sets this from the connection itself
  const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS) || 1));
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - hops] ?? parts[0] ?? real ?? "unknown";
}

let ipSecret: Promise<string> | undefined;

/** IP_SALT if set, otherwise a random secret created once and kept in the database. */
function getIpSecret(): Promise<string> {
  if (process.env.IP_SALT) return Promise.resolve(process.env.IP_SALT);
  if (!ipSecret) {
    const pending = (async () => {
      const db = await getDb();
      await db.query(`insert into settings (key, value) values ('ip_salt', $1) on conflict (key) do nothing`, [
        randomBytes(32).toString("hex"),
      ]);
      const rows = await db.query<{ value: string }>(`select value from settings where key = 'ip_salt'`);
      return rows[0].value;
    })();
    pending.catch(() => {
      if (ipSecret === pending) ipSecret = undefined;
    });
    ipSecret = pending;
  }
  return ipSecret;
}

/** Keyed hash for spam limits. Without the secret it can't be reversed, and it's wiped after 2 days. */
export async function clientIpHash(req: Request): Promise<string> {
  return createHmac("sha256", await getIpSecret()).update(clientIp(req)).digest("hex").slice(0, 32);
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Parses a small JSON object body, or returns null. Requiring a JSON content type means browsers
 * send a CORS preflight first, so other websites can't make their visitors submit to this app.
 */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  if (req.headers.get("sec-fetch-site") === "cross-site") return null;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/** Trims, collapses control characters, and enforces a max length. Empty -> null. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .slice(0, max * 4)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return text ? text.slice(0, max) : null;
}

const COURSE_COLUMNS = `
  id, code, name, instructor, timezone,
  open_question as "openQuestion",
  class_size as "classSize",
  is_open as "isOpen",
  (now() at time zone timezone)::date::text as today`;

export async function findCourseByCode(code: string): Promise<CourseInfo | null> {
  const db = await getDb();
  const rows = await db.query<CourseInfo>(`select ${COURSE_COLUMNS} from courses where code = $1`, [
    code,
  ]);
  return rows[0] ?? null;
}

/** Resolves `Authorization: Bearer <key>` to the course it manages. */
export async function courseFromAuth(req: Request): Promise<CourseInfo | null> {
  const key = req.headers.get("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]{20,64})$/)?.[1];
  if (!key) return null;
  const db = await getDb();
  const rows = await db.query<CourseInfo>(
    `select ${COURSE_COLUMNS} from courses where admin_key_hash = $1`,
    [sha256(key)],
  );
  return rows[0] ?? null;
}
