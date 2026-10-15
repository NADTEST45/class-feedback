// Shared by server and browser code. Keep free of Node-only imports.

// No 0/O, 1/I/L: codes get read off a projector and typed on a phone.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export const RATINGS = [
  { value: 1, emoji: "😣", label: "Lost" },
  { value: 2, emoji: "😕", label: "Shaky" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🤩", label: "Nailed it" },
] as const;

export const PACES = [
  { value: -1, label: "Too slow" },
  { value: 0, label: "Just right" },
  { value: 1, label: "Too fast" },
] as const;

export const RATING_QUESTION = "How well did you follow today's class?";
export const PACE_QUESTION = "The pace was…";
export const DEFAULT_OPEN_QUESTION = "What's one thing from today that's still unclear?";

export const LIMITS = {
  courseName: 120,
  instructor: 80,
  openQuestion: 160,
  comment: 1000,
} as const;

/** "2026-02-30" matches a date regex but isn't a date; Postgres would reject it with a 500. */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 2000) return false; // Postgres has no year 0; class days are recent
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function ratingLabel(value: number | null | undefined): string {
  return RATINGS.find((r) => r.value === value)?.label ?? "";
}

export function paceLabel(value: number | null | undefined): string {
  return PACES.find((p) => p.value === value)?.label ?? "";
}

/** "2026-10-14" -> "Tue, 14 Oct" without timezone drift (the date is already local to the course). */
export function formatSessionDate(isoDate: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export type SessionSummary = {
  date: string;
  responses: number;
  avgRating: number | null;
  struggling: number; // rated Lost or Shaky
  slow: number;
  right: number;
  fast: number;
  comments: number;
};

export type ResponseRow = {
  id: number;
  rating: number | null;
  pace: number | null;
  comment: string | null;
  time: string;
};

export type CourseInfo = {
  id: string;
  code: string;
  name: string;
  instructor: string;
  timezone: string;
  openQuestion: string;
  classSize: number | null;
  isOpen: boolean;
  today: string;
};

export type DashboardData = {
  course: CourseInfo;
  sessions: SessionSummary[];
  selectedDate: string;
  distribution: number[]; // counts for ratings 1..5 on the selected date
  responses: ResponseRow[];
};
