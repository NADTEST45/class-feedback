"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId, store } from "@/lib/client";
import {
  LIMITS,
  PACE_QUESTION,
  PACES,
  RATING_QUESTION,
  RATINGS,
  formatSessionDate,
} from "@/lib/shared";

export type StudentCourse = {
  code: string;
  name: string;
  instructor: string;
  openQuestion: string;
  timezone: string;
  today: string;
};

// comment: null keeps the saved comment, "" clears it, any other string replaces it.
type Answer = { rating: number | null; pace: number | null; comment: string | null };
// commentSent: a comment reached the server, so an empty box means "clear it" (the draft text alone can't tell).
type Saved = Answer & { date: string; done: boolean; commentSent?: boolean };
type Payload = Answer & { code: string; deviceId: string; sessionDate: string };
type Status = "idle" | "saving" | "saved" | "queued" | "error";
type SendResult = "sent" | "queued" | "rejected";

const RETRY_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

function dayBefore(isoDate: string): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return "";
  }
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

export function FeedbackForm({ course }: { course: StudentCourse }) {
  const savedKey = `cf:resp:${course.code}`;
  // One slot per class day, so an answer waiting for yesterday's class can't overwrite or drop today's.
  const pendingPrefix = `cf:pending:${course.code}:`;
  const pendingKey = useCallback((date: string) => `${pendingPrefix}${date}`, [pendingPrefix]);

  const [rating, setRating] = useState<number | null>(null);
  const [pace, setPace] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const deviceId = useRef("");
  // The class day this page is answering for.
  const sessionDate = useRef(course.today);
  // Requests go out one at a time, so a fast double-tap can never land out of order.
  const queue = useRef<Promise<SendResult>>(Promise.resolve("sent"));
  const flushing = useRef(false);

  // live = sent from this page's form; replay = a queued answer, possibly for another class day.
  const post = useCallback(
    async (payload: Payload, live: boolean): Promise<SendResult> => {
      const slot = pendingKey(payload.sessionDate);
      // Written before sending, so closing the page mid-request loses nothing.
      store.set(slot, payload);
      try {
        const res = await fetch("/api/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          signal: timeoutSignal(REQUEST_TIMEOUT_MS),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status >= 500) throw new Error("server");
        store.remove(slot);
        if (!res.ok) {
          setError(data.error || "Couldn't save your answer.");
          setStatus("error");
          return "rejected";
        }
        if (live && data.sessionDate) sessionDate.current = data.sessionDate;
        setError("");
        setStatus("saved");
        return "sent";
      } catch {
        // Offline, timed out or a server hiccup: it stays on the phone and keeps retrying.
        setStatus("queued");
        return "queued";
      }
    },
    [pendingKey],
  );

  // Anything still waiting for the same class day rides along, so a later tap can't drop it.
  const withPending = useCallback(
    (payload: Payload): Payload => {
      const prev = store.get<Payload>(pendingKey(payload.sessionDate));
      if (!prev) return payload;
      return {
        ...payload,
        rating: payload.rating ?? prev.rating,
        pace: payload.pace ?? prev.pace,
        comment: payload.comment ?? prev.comment,
      };
    },
    [pendingKey],
  );

  const send = useCallback(
    (answer: Answer): Promise<SendResult> => {
      const payload: Payload = {
        ...answer,
        code: course.code,
        deviceId: deviceId.current || getDeviceId(),
        sessionDate: sessionDate.current,
      };
      setStatus("saving");
      queue.current = queue.current.then(() => post(withPending(payload), true));
      return queue.current;
    },
    [course.code, post, withPending],
  );

  const flushPending = useCallback(() => {
    if (flushing.current) return;
    // The server only files answers under today's or yesterday's class; anything older can't be placed.
    const keep = new Set([pendingKey(course.today), pendingKey(dayBefore(course.today))]);
    const slots: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(pendingPrefix)) slots.push(k);
      }
    } catch {
      return;
    }
    slots.filter((k) => !keep.has(k)).forEach((k) => store.remove(k));
    const due = slots.filter((k) => keep.has(k)).sort();
    if (!due.length) return;
    flushing.current = true;
    for (const k of due) {
      queue.current = queue.current.then(() => {
        const latest = store.get<Payload>(k);
        return latest ? post(latest, false) : ("sent" as const);
      });
    }
    queue.current = queue.current.finally(() => {
      flushing.current = false;
    });
  }, [course.today, pendingKey, pendingPrefix, post]);

  // Restore today's answers (so a refresh doesn't look like nothing was saved) and retry anything queued.
  useEffect(() => {
    deviceId.current = getDeviceId();
    store.remove(`cf:pending:${course.code}`); // pre-release single-slot format
    const saved = store.get<Saved>(savedKey);
    if (saved && saved.date === course.today) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setRating(saved.rating);
      setPace(saved.pace);
      setComment(saved.comment ?? "");
      setDone(saved.done);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    flushPending();
    const retry = () => {
      if (!document.hidden) flushPending();
    };
    // A tab left open from an earlier class shows that day's form; reload it when the student comes back.
    const onReturn = () => {
      if (document.hidden) return;
      const now = todayIn(course.timezone);
      if (now && now > course.today && !store.get(pendingKey(course.today))) window.location.reload();
      else flushPending();
    };
    const timer = setInterval(retry, RETRY_MS);
    window.addEventListener("online", flushPending);
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", flushPending);
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [course.code, course.timezone, course.today, savedKey, pendingKey, flushPending]);

  function remember(patch: Partial<Saved>) {
    const current = store.get<Saved>(savedKey);
    const base: Saved =
      current && current.date === course.today
        ? current
        : { date: course.today, rating: null, pace: null, comment: null, done: false };
    store.set(savedKey, { ...base, ...patch });
  }

  function chooseRating(value: number) {
    setRating(value);
    remember({ rating: value });
    void send({ rating: value, pace, comment: null });
  }

  function choosePace(value: number) {
    setPace(value);
    remember({ pace: value });
    void send({ rating, pace: value, comment: null });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = comment.trim();
    const hadComment = !!store.get<Saved>(savedKey)?.commentSent;
    if (rating === null && pace === null && !text && !hadComment) {
      setError("Tap a face first. That's all it takes.");
      return;
    }
    setSubmitting(true);
    // An empty string clears a comment sent earlier.
    const result = await send({ rating, pace, comment: text });
    setSubmitting(false);
    if (result === "rejected") return;
    remember({ comment: text || null, commentSent: !!text, done: true });
    setDone(true);
  }

  const teacher = course.instructor || "Your teacher";

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-good-soft">
          <svg viewBox="0 0 24 24" className="size-10 text-good" aria-hidden="true">
            <path
              d="m5 12.5 4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold">Thanks, got it!</h1>
        <p className="mt-2 max-w-xs text-ink-2">
          Your answer is anonymous. {teacher} sees your answer, but not who sent it.
        </p>
        {status === "error" && error && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            Your answer couldn&apos;t be saved: {error}
          </p>
        )}
        {status === "queued" && (
          <p role="status" className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">
            Couldn&apos;t reach the server. Your answer is saved on this phone and will be sent automatically
            when the connection is back. Keeping this page open helps.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setDone(false);
            remember({ done: false });
          }}
          className="mt-8 rounded-xl border border-line-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Change my answer
        </button>
        <p className="mt-10 text-sm text-muted">{course.name}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
      <header>
        <p className="text-sm text-muted">
          {[course.instructor, formatSessionDate(course.today)].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight text-balance">{course.name}</h1>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path
              d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
          Anonymous. No names, no login.
        </p>
      </header>

      <fieldset className="mt-7">
        <legend className="text-lg font-semibold">{RATING_QUESTION}</legend>
        <div role="radiogroup" aria-label={RATING_QUESTION} className="mt-3 grid grid-cols-5 gap-1.5">
          {RATINGS.map((r) => {
            const selected = rating === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseRating(r.value)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition ${
                  selected
                    ? "border-brand bg-brand-soft ring-2 ring-brand"
                    : "border-line bg-surface hover:border-line-strong active:scale-95"
                }`}
              >
                <span aria-hidden="true" className={`text-3xl leading-none ${rating && !selected ? "opacity-50" : ""}`}>
                  {r.emoji}
                </span>
                <span className={`text-[11px] leading-tight font-medium ${selected ? "text-ink" : "text-ink-2"}`}>
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-lg font-semibold">{PACE_QUESTION}</legend>
        <div role="radiogroup" aria-label="Pace" className="mt-3 grid grid-cols-3 gap-1.5">
          {PACES.map((p) => {
            const selected = pace === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choosePace(p.value)}
                className={`min-h-12 rounded-xl border px-2 text-sm font-medium transition ${
                  selected
                    ? "border-brand bg-brand-soft text-ink ring-2 ring-brand"
                    : "border-line bg-surface text-ink-2 hover:border-line-strong active:scale-95"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-7">
        <label htmlFor="comment" className="text-lg font-semibold">
          {course.openQuestion}{" "}
          <span className="text-sm font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => remember({ comment: comment.trim() || null })}
          maxLength={LIMITS.comment}
          rows={3}
          placeholder="e.g. I didn't get how the recursion unwinds"
          className="mt-3 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
        />
        {comment.length > LIMITS.comment * 0.8 && (
          <p className="mt-1 text-right text-xs text-muted tnum">
            {comment.length}/{LIMITS.comment}
          </p>
        )}
      </div>

      <div className="mt-6 pb-4">
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand px-5 py-4 text-lg font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send feedback"}
        </button>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-sm text-muted">
          {status === "saving" && "Saving…"}
          {status === "saved" && "✓ Saved. Add more above, or you're done."}
          {status === "queued" &&
            "Couldn't reach the server. Saved on this phone; it will be sent automatically. Keeping this page open helps."}
        </p>
      </div>
    </form>
  );
}
