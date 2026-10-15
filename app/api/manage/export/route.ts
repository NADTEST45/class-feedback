import { getDb } from "@/lib/db";
import { courseFromAuth, jsonError } from "@/lib/server";
import { paceLabel, ratingLabel } from "@/lib/shared";

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Stop spreadsheet apps from executing student-written text as a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const course = await courseFromAuth(req);
  if (!course) return jsonError(401, "This dashboard link isn't valid.");
  const db = await getDb();

  const rows = await db.query<{
    date: string;
    time: string;
    rating: number | null;
    pace: number | null;
    comment: string | null;
  }>(
    `select session_date::text as date,
            to_char(created_at at time zone $2, 'HH24:MI') as time,
            rating, pace, comment
     from responses where course_id = $1
     order by session_date desc, created_at asc`,
    [course.id, course.timezone],
  );

  const header = ["Class date", "Time", "Understanding (1-5)", "Understanding", "Pace", "Still unclear"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.date, r.time, r.rating ?? "", ratingLabel(r.rating), paceLabel(r.pace), r.comment ?? ""]
        .map(csvCell)
        .join(","),
    );
  }

  const filename = `${course.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "class"}-feedback.csv`;
  // BOM so Excel opens non-English comments (Telugu, Hindi, …) correctly.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
