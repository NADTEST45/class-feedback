"use client";

import { useEffect, useState } from "react";
import { forgetCourse, getSavedCourses, type SavedCourse } from "@/lib/client";

/** Courses this browser created or chose to remember. The admin links never leave the device. */
export function MyCourses() {
  const [courses, setCourses] = useState<SavedCourse[]>([]);

  useEffect(() => {
    // Read after mount: localStorage doesn't exist during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourses(getSavedCourses());
  }, []);

  if (!courses.length) return null;

  return (
    <section aria-labelledby="my-courses" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="my-courses" className="text-sm font-semibold text-ink">
        Your courses on this device
      </h2>
      <p className="mt-1 text-xs text-muted">Anyone using this browser can open these. Forget them on shared computers.</p>
      <ul className="mt-3 divide-y divide-line">
        {courses.map((c) => (
          <li key={c.key} className="flex items-center gap-2">
            <a
              href={`/manage#k=${c.key}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-ink hover:text-brand"
            >
              <span className="min-w-0 truncate font-medium">{c.name}</span>
              <span className="shrink-0 font-mono text-sm text-muted">{c.code} →</span>
            </a>
            <button
              type="button"
              onClick={() => {
                forgetCourse(c.key);
                setCourses(getSavedCourses());
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink"
              aria-label={`Forget ${c.name} on this device`}
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
