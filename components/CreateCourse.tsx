"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveCourse } from "@/lib/client";
import { LIMITS } from "@/lib/shared";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none";

export function CreateCourse() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setError("Give your course a name students will recognise.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          instructor: form.get("instructor"),
          classSize: form.get("classSize"),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      saveCourse({ code: data.code, name: data.name, key: data.key });
      router.push(`/manage#k=${data.key}&new=1`);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="cc-name" className="block text-sm font-medium text-ink-2">
          Course name
        </label>
        <input
          id="cc-name"
          name="name"
          required
          maxLength={LIMITS.courseName}
          placeholder="e.g. Data Structures — CSE A"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem]">
        <div>
          <label htmlFor="cc-instructor" className="block text-sm font-medium text-ink-2">
            Your name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="cc-instructor"
            name="instructor"
            maxLength={LIMITS.instructor}
            placeholder="e.g. Dr. Rao"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="cc-size" className="block text-sm font-medium text-ink-2">
            Students <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="cc-size"
            name="classSize"
            type="number"
            min={1}
            max={2000}
            inputMode="numeric"
            placeholder="60"
            className={`mt-1.5 ${inputClass} tnum`}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create course and get my QR code"}
      </button>
      <p className="text-xs text-muted">
        No sign-up. You&apos;ll get a private dashboard link. Students never need an account.
      </p>
    </form>
  );
}
