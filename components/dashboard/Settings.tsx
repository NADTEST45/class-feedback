"use client";

import { useState } from "react";
import { copyText, dashboardUrl } from "@/lib/client";
import { DEFAULT_OPEN_QUESTION, LIMITS, type CourseInfo } from "@/lib/shared";

const input =
  "mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink focus:border-brand focus:outline-none";

export function Settings({
  course,
  adminKey,
  onSave,
  onDelete,
}: {
  course: CourseInfo;
  adminKey: string;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const ok = await onSave({
      name: f.get("name"),
      instructor: f.get("instructor"),
      classSize: f.get("classSize"),
      openQuestion: f.get("openQuestion"),
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-4" key={course.name + course.openQuestion}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-name" className="text-sm font-medium text-ink-2">
              Course name
            </label>
            <input id="s-name" name="name" required maxLength={LIMITS.courseName} defaultValue={course.name} className={input} />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div>
              <label htmlFor="s-instructor" className="text-sm font-medium text-ink-2">
                Your name
              </label>
              <input id="s-instructor" name="instructor" maxLength={LIMITS.instructor} defaultValue={course.instructor} className={input} />
            </div>
            <div>
              <label htmlFor="s-size" className="text-sm font-medium text-ink-2">
                Students
              </label>
              <input
                id="s-size"
                name="classSize"
                type="number"
                min={1}
                max={2000}
                defaultValue={course.classSize ?? ""}
                className={`${input} tnum`}
              />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="s-q" className="text-sm font-medium text-ink-2">
            Open question (question 3)
          </label>
          <input
            id="s-q"
            name="openQuestion"
            maxLength={LIMITS.openQuestion}
            defaultValue={course.openQuestion}
            placeholder={DEFAULT_OPEN_QUESTION}
            className={input}
          />
          <p className="mt-1 text-xs text-muted">
            Try: &ldquo;What should we review next class?&rdquo; or &ldquo;Which example helped most?&rdquo;
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <span role="status" className="text-sm text-good">✓ Saved</span>}
        </div>
      </form>

      <div className="border-t border-line pt-6">
        <h3 className="text-sm font-semibold">Your private dashboard link</h3>
        <p className="mt-1 text-sm text-ink-2">
          Anyone with this link can see results and change settings. Don&apos;t share it with students.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              if (await copyText(dashboardUrl(adminKey))) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="rounded-xl border border-line-strong px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
          >
            {copied ? "Copied ✓" : "Copy private link"}
          </button>
          <a
            href={`mailto:?subject=${encodeURIComponent(`Class Feedback dashboard: ${course.name}`)}&body=${encodeURIComponent(
              `My private dashboard for ${course.name}:\n\n${typeof window === "undefined" ? "" : dashboardUrl(adminKey)}\n\nStudent code: ${course.code}`,
            )}`}
            className="rounded-xl border border-line-strong px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Email it to myself
          </a>
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <h3 className="text-sm font-semibold text-danger">Delete course</h3>
        <p className="mt-1 text-sm text-ink-2">
          Permanently deletes this course and every response. Export a spreadsheet first if you need it. Type{" "}
          <strong className="font-mono">{course.code}</strong> to confirm.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.toUpperCase())}
            aria-label="Type the course code to confirm deletion"
            className="w-36 rounded-xl border border-line-strong bg-surface px-3 py-2 font-mono uppercase"
          />
          <button
            type="button"
            disabled={confirm !== course.code}
            onClick={onDelete}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-danger-ink disabled:opacity-40"
          >
            Delete forever
          </button>
        </div>
      </div>
    </div>
  );
}
