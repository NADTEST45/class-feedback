"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import {
  copyText,
  dashboardUrl,
  downloadBlob,
  forgetCourse,
  getSavedCourses,
  saveCourse,
  slug,
} from "@/lib/client";
import {
  RATINGS,
  formatSessionDate,
  paceLabel,
  type DashboardData,
  type ResponseRow,
  type SessionSummary,
} from "@/lib/shared";
import { PaceBar, RatingBars, TrendChart } from "./Charts";
import { Settings } from "./Settings";
import { ShareCard } from "./ShareCard";

type Phase = "loading" | "nokey" | "invalid" | "error" | "ready";

const card = "rounded-2xl border border-line bg-surface p-5 sm:p-6";

export function Dashboard() {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [remembered, setRemembered] = useState(false);
  const hasData = useRef(false);
  // Only the newest request may update the screen, so a slow poll can't undo a date the teacher picked.
  const reqSeq = useRef(0);

  // The admin key lives in the URL fragment, which browsers never send to servers or put in logs.
  useEffect(() => {
    function readHash() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const k = params.get("k");
      if (!k) {
        setPhase("nokey");
        return;
      }
      setKey(k);
      if (params.get("new") === "1") {
        setIsNew(true);
        history.replaceState(null, "", `#k=${k}`);
        // Client navigation keeps the home page's scroll; the save-your-link banner must be seen.
        window.scrollTo(0, 0);
      }
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const authed = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(path, {
        ...init,
        cache: "no-store",
        headers: { ...init.headers, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      }),
    [key],
  );

  const load = useCallback(
    async (quiet = false) => {
      if (!key) return;
      const seq = ++reqSeq.current;
      if (quiet) setRefreshing(true);
      try {
        const res = await authed(`/api/manage${selected ? `?date=${selected}` : ""}`);
        if (seq !== reqSeq.current) return;
        if (res.status === 401) {
          setPhase("invalid");
          return;
        }
        const body = await res.json();
        if (seq !== reqSeq.current) return;
        if (!res.ok) throw new Error(body.error || "Couldn't load results.");
        setData(body);
        hasData.current = true;
        setPhase("ready");
        setUpdatedAt(new Date());
        // Only the browser that created the course remembers it automatically. Anywhere else (often a
        // shared classroom PC) the teacher has to opt in, so the next person can't find the link.
        const known = getSavedCourses().some((c) => c.key === key);
        if (known) saveCourse({ code: body.course.code, name: body.course.name, key }); // keep the name current
        setRemembered(known);
      } catch (err) {
        // On a background refresh, keep showing the last good data.
        if (!hasData.current && seq === reqSeq.current) {
          setErrorMsg(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Couldn't reach the server.");
          setPhase("error");
        }
      } finally {
        if (seq === reqSeq.current) setRefreshing(false);
      }
    },
    [key, selected, authed],
  );

  useEffect(() => {
    load(hasData.current);
  }, [load]);

  // Live updates while looking at today's class, or before today's first answer when no date was picked
  // (the default view switches to today as soon as one arrives).
  const viewingToday = !!data && data.selectedDate === data.course.today;
  const live = viewingToday || (!!data && selected === null);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => !document.hidden && load(true), 15000);
    const onVisible = () => !document.hidden && load(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, load]);

  async function patch(body: Record<string, unknown>) {
    const res = await authed("/api/manage", { method: "PATCH", body: JSON.stringify(body) });
    if (res.ok) await load(true);
    else alert((await res.json().catch(() => ({}))).error || "Couldn't save.");
    return res.ok;
  }

  async function exportCsv() {
    const res = await authed("/api/manage/export");
    if (!res.ok) return alert("Couldn't export right now. Please try again.");
    downloadBlob(await res.blob(), `${slug(data?.course.name ?? "class")}-feedback.csv`);
  }

  function toggleRemember() {
    if (!key || !data) return;
    if (remembered) forgetCourse(key);
    else saveCourse({ code: data.course.code, name: data.course.name, key });
    setRemembered(!remembered);
  }

  async function removeResponse(id: number) {
    if (!confirm("Remove this response? This can't be undone.")) return;
    try {
      const res = await authed(`/api/manage?response=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await load(true);
    } catch {
      alert("Couldn't remove it. Check your connection and try again.");
    }
  }

  async function remove() {
    const res = await authed("/api/manage", { method: "DELETE" });
    if (!res.ok) return alert("Couldn't delete the course. Please try again.");
    if (key) forgetCourse(key);
    router.push("/");
  }

  return (
    <div className="flex-1">
      <header className="no-print mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo />
        <Link href="/#teachers" className="text-sm font-medium text-ink-2 hover:text-ink">
          All my courses
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {phase === "loading" && <DashboardSkeleton />}
        {phase === "nokey" && <NoKey />}
        {phase === "invalid" && <InvalidKey adminKey={key} />}
        {phase === "error" && (
          <Message title="Couldn't load your results" body={errorMsg}>
            <button
              type="button"
              onClick={() => load()}
              className="mt-4 rounded-xl bg-brand px-4 py-2 font-semibold text-brand-ink"
            >
              Try again
            </button>
          </Message>
        )}
        {phase === "ready" && data && key && (
          <Ready
            data={data}
            adminKey={key}
            isNew={isNew}
            onDismissNew={() => setIsNew(false)}
            refreshing={refreshing}
            updatedAt={updatedAt}
            viewingToday={viewingToday}
            live={live}
            remembered={remembered}
            onToggleRemember={toggleRemember}
            onSelect={setSelected}
            onPatch={patch}
            onExport={exportCsv}
            onDelete={remove}
            onRemoveResponse={removeResponse}
          />
        )}
      </main>
    </div>
  );
}

function Ready({
  data,
  adminKey,
  isNew,
  onDismissNew,
  refreshing,
  updatedAt,
  viewingToday,
  live,
  remembered,
  onToggleRemember,
  onSelect,
  onPatch,
  onExport,
  onDelete,
  onRemoveResponse,
}: {
  data: DashboardData;
  adminKey: string;
  isNew: boolean;
  onDismissNew: () => void;
  refreshing: boolean;
  updatedAt: Date | null;
  viewingToday: boolean;
  live: boolean;
  remembered: boolean;
  onToggleRemember: () => void;
  onSelect: (date: string) => void;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onExport: () => void;
  onDelete: () => Promise<void>;
  onRemoveResponse: (id: number) => Promise<void>;
}) {
  const { course, sessions, selectedDate, distribution, responses } = data;
  const session = sessions.find((s) => s.date === selectedDate);
  const previous = sessions.find((s) => s.date < selectedDate && s.avgRating !== null);

  // The picker always offers today, even before anyone has answered.
  const options = useMemo(() => {
    const dates = sessions.map((s) => s.date);
    if (!dates.includes(course.today)) dates.unshift(course.today);
    if (!dates.includes(selectedDate)) dates.unshift(selectedDate);
    return dates;
  }, [sessions, course.today, selectedDate]);

  return (
    <div className="space-y-6">
      {isNew && <SaveLinkBanner adminKey={adminKey} courseName={course.name} code={course.code} onDone={onDismissNew} />}

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{course.instructor || "Your course"}</p>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-balance">{course.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-mono font-semibold tracking-wider">
              {course.code}
            </span>
            {course.isOpen ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-good-soft px-2.5 py-1 font-medium text-good">
                <span aria-hidden="true" className="size-2 rounded-full bg-current" /> Collecting
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn-soft px-2.5 py-1 font-medium text-warn-ink">
                <span aria-hidden="true">⏸</span> Paused
              </span>
            )}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPatch({ isOpen: !course.isOpen })}
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
          >
            {course.isOpen ? "Pause feedback" : "Resume feedback"}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Export spreadsheet
          </button>
          <button
            type="button"
            onClick={onToggleRemember}
            title={remembered ? "Remove this course from this browser's list" : "Don't do this on a shared computer"}
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
          >
            {remembered ? "Forget on this device" : "Remember on this device"}
          </button>
        </div>
      </section>

      <ShareCard code={course.code} name={course.name} />

      {/* One filter row scopes everything below it. */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-2">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
          Results for
          <select
            value={selectedDate}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-xl border border-line-strong bg-surface px-3 py-2 text-ink"
          >
            {options.map((d) => {
              const s = sessions.find((x) => x.date === d);
              return (
                <option key={d} value={d}>
                  {d === course.today ? "Today, " : ""}
                  {formatSessionDate(d, { year: true })}
                  {s ? ` (${s.responses})` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <p className="text-xs text-muted" aria-live="polite">
          {refreshing ? "Updating…" : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          {live && " · refreshes automatically"}
        </p>
      </div>

      <div className={`space-y-6 transition-opacity ${refreshing ? "opacity-70" : ""}`}>
        {!session || session.responses === 0 ? (
          <EmptySession isToday={viewingToday} code={course.code} isOpen={course.isOpen} />
        ) : (
          <>
            <KpiRow session={session} previous={previous} classSize={course.classSize} />
            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="h-understanding" className={card}>
                <h2 id="h-understanding" className="font-semibold">
                  How well they followed
                </h2>
                <p className="mt-0.5 text-sm text-muted">Students per answer</p>
                <div className="mt-5">
                  <RatingBars distribution={distribution} />
                </div>
              </section>
              <section aria-labelledby="h-pace" className={card}>
                <h2 id="h-pace" className="font-semibold">
                  Pace
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {session.slow + session.right + session.fast} answered
                </p>
                <div className="mt-5">
                  <PaceBar slow={session.slow} right={session.right} fast={session.fast} />
                </div>
              </section>
            </div>
            <Comments responses={responses} question={course.openQuestion} onRemove={onRemoveResponse} />
          </>
        )}

        <Sessions sessions={sessions} selectedDate={selectedDate} onSelect={onSelect} />
      </div>

      <Tips />

      <details className={`${card} no-print group`}>
        <summary className="cursor-pointer list-none font-semibold marker:hidden">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
            ›
          </span>{" "}
          Course settings
        </summary>
        <div className="mt-5">
          <Settings course={course} adminKey={adminKey} onSave={onPatch} onDelete={onDelete} />
        </div>
      </details>
    </div>
  );
}

function KpiRow({
  session,
  previous,
  classSize,
}: {
  session: SessionSummary;
  previous?: SessionSummary;
  classSize: number | null;
}) {
  const avg = session.avgRating;
  const rated = session.responses; // includes the rare pace-only answer; close enough for a share
  const strugglingPct = rated ? Math.round((session.struggling / rated) * 100) : 0;
  const delta = avg !== null && previous?.avgRating != null ? avg - previous.avgRating : null;
  const face = avg !== null ? RATINGS[Math.min(4, Math.max(0, Math.round(avg) - 1))] : null;
  const rate = classSize ? Math.min(100, Math.round((session.responses / classSize) * 100)) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className={card}>
        <p className="text-sm text-ink-2">Average understanding</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-5xl font-semibold tracking-tight">{avg !== null ? avg.toFixed(1) : "–"}</span>
          <span className="text-lg text-muted">/ 5</span>
          {face && (
            <span className="ml-1 text-2xl" title={face.label} aria-label={face.label}>
              {face.emoji}
            </span>
          )}
        </p>
        {delta !== null && previous && (
          <p className={`mt-2 text-sm ${delta > 0.05 ? "text-good" : delta < -0.05 ? "text-danger" : "text-muted"}`}>
            <span aria-hidden="true">{delta > 0.05 ? "▲" : delta < -0.05 ? "▼" : "■"}</span>{" "}
            {delta > 0.05 ? "Up" : delta < -0.05 ? "Down" : "Same"} {Math.abs(delta).toFixed(1)} from{" "}
            {formatSessionDate(previous.date)}
          </p>
        )}
      </div>

      <div className={card}>
        <p className="text-sm text-ink-2">Responses</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-5xl font-semibold tracking-tight">{session.responses}</span>
          {classSize && <span className="text-lg text-muted">of {classSize}</span>}
        </p>
        {rate !== null ? (
          <div className="mt-3">
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: "color-mix(in srgb, var(--series-1) 18%, transparent)" }}
              role="meter"
              aria-valuenow={rate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Response rate"
            >
              <div className="h-full rounded-full bg-series-1" style={{ width: `${rate}%` }} />
            </div>
            <p className="mt-1.5 text-sm text-muted">{rate}% of the class answered</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{session.comments} left a comment</p>
        )}
      </div>

      <div className={`${card} ${strugglingPct >= 25 ? "border-warn-ink/40 bg-warn-soft" : ""}`}>
        <p className="text-sm text-ink-2">Struggling</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-5xl font-semibold tracking-tight">{session.struggling}</span>
          <span className="text-lg text-muted">({strugglingPct}%)</span>
        </p>
        <p className={`mt-2 text-sm ${strugglingPct >= 25 ? "text-warn-ink" : "text-muted"}`}>
          {strugglingPct >= 25 && <span aria-hidden="true">⚠ </span>}
          answered &ldquo;Lost&rdquo; or &ldquo;Shaky&rdquo;
          {strugglingPct >= 25 && ". Worth a recap next class."}
        </p>
      </div>
    </div>
  );
}

function Comments({
  responses,
  question,
  onRemove,
}: {
  responses: ResponseRow[];
  question: string;
  onRemove: (id: number) => Promise<void>;
}) {
  const [order, setOrder] = useState<"confused" | "newest">("confused");
  const [copied, setCopied] = useState(false);
  // Answers without a comment can be shown too, so rating-only spam can also be removed.
  const [showAll, setShowAll] = useState(false);
  const withText = responses.filter((r) => r.comment);
  const shown = showAll ? responses : withText;
  const sorted = useMemo(
    () =>
      order === "newest"
        ? shown
        : [...shown].sort((a, b) => (a.rating ?? 6) - (b.rating ?? 6) || b.time.localeCompare(a.time)),
    [shown, order],
  );

  return (
    <section aria-labelledby="h-comments" className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="h-comments" className="font-semibold">
            Still unclear <span className="font-normal text-muted tnum">({withText.length})</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted">&ldquo;{question}&rdquo;</p>
        </div>
        {withText.length > 0 && (
          <div className="no-print flex flex-wrap gap-2 text-sm">
            <div role="group" aria-label="Sort comments" className="inline-flex rounded-xl border border-line-strong p-0.5">
              {(["confused", "newest"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={order === o}
                  onClick={() => setOrder(o)}
                  className={`rounded-[10px] px-3 py-1.5 ${order === o ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
                >
                  {o === "confused" ? "Most confused first" : "Newest"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (await copyText(sorted.filter((r) => r.comment).map((r) => `- ${r.comment}`).join("\n"))) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="rounded-xl border border-line-strong px-3 py-1.5 hover:bg-surface-2"
            >
              {copied ? "Copied ✓" : "Copy all"}
            </button>
          </div>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No written comments for this class.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {sorted.map((r) => {
            const face = RATINGS.find((x) => x.value === r.rating);
            return (
              <li key={r.id} className="group py-3.5">
                {r.comment ? (
                  <p className="whitespace-pre-wrap break-words text-ink">{r.comment}</p>
                ) : (
                  <p className="text-sm italic text-muted">No comment</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted">
                  {face ? (
                    <>
                      <span aria-hidden="true">{face.emoji}</span> {face.label}
                    </>
                  ) : (
                    "No rating"
                  )}
                  {r.pace !== null && ` · ${paceLabel(r.pace)}`} · {r.time}
                  <button
                    type="button"
                    onClick={() => onRemove(r.id)}
                    className="no-print ml-2 rounded px-1.5 text-muted underline-offset-2 hover:text-danger hover:underline focus-visible:text-danger"
                    aria-label="Remove this response (spam or abuse)"
                  >
                    Remove
                  </button>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {responses.length > withText.length && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="no-print mt-3 text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          {showAll
            ? "Show only answers with comments"
            : `Also show ${responses.length - withText.length} answers without comments`}
        </button>
      )}
    </section>
  );
}

function Sessions({
  sessions,
  selectedDate,
  onSelect,
}: {
  sessions: SessionSummary[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  if (!sessions.length) return null;
  const rated = sessions.filter((s) => s.avgRating !== null).length;

  return (
    <section aria-labelledby="h-sessions" className={card}>
      <h2 id="h-sessions" className="font-semibold">
        All classes
      </h2>
      <p className="mt-0.5 text-sm text-muted">Average understanding per class (1 = Lost, 5 = Nailed it). Click a class to open it.</p>
      {rated >= 2 ? (
        <div className="mt-4">
          <TrendChart sessions={sessions} selectedDate={selectedDate} onSelect={onSelect} />
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          The trend chart appears after your second class.
        </p>
      )}
      <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-2 font-medium sm:px-6">Class</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Responses</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Understanding</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Struggling</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Too fast</th>
              <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">Comments</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {sessions.map((s) => {
              const paced = s.slow + s.right + s.fast;
              const active = s.date === selectedDate;
              return (
                <tr
                  key={s.date}
                  onClick={() => onSelect(s.date)}
                  className={`cursor-pointer border-b border-line last:border-0 ${active ? "bg-brand-soft" : "hover:bg-surface-2"}`}
                >
                  <th scope="row" className="px-5 py-2.5 font-medium sm:px-6">
                    <button type="button" onClick={() => onSelect(s.date)} className="text-left" aria-current={active || undefined}>
                      {formatSessionDate(s.date, { year: true })}
                    </button>
                  </th>
                  <td className="px-3 py-2.5 text-right">{s.responses}</td>
                  <td className="px-3 py-2.5 text-right">{s.avgRating !== null ? s.avgRating.toFixed(1) : "–"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.struggling}
                    <span className="text-muted"> ({s.responses ? Math.round((s.struggling / s.responses) * 100) : 0}%)</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{paced ? `${Math.round((s.fast / paced) * 100)}%` : "–"}</td>
                  <td className="px-5 py-2.5 text-right sm:px-6">{s.comments}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptySession({ isToday, code, isOpen }: { isToday: boolean; code: string; isOpen: boolean }) {
  return (
    <section className={`${card} text-center`}>
      <p className="text-3xl" aria-hidden="true">
        📭
      </p>
      <h2 className="mt-3 font-semibold">{isToday ? "No responses yet today" : "No responses for this class"}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
        {!isOpen
          ? "Feedback is paused. Resume it above so students can answer."
          : isToday
            ? "Show the QR in the last 2 minutes of class. Answers appear here within seconds."
            : "Nobody answered on this day."}
      </p>
      {isToday && isOpen && (
        <a
          href={`/present/${code}`}
          target="_blank"
          rel="noopener"
          className="mt-4 inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover"
        >
          Show QR on projector ↗
        </a>
      )}
    </section>
  );
}

function Tips() {
  return (
    <section aria-labelledby="h-tips" className="no-print rounded-2xl bg-brand-soft p-5 sm:p-6">
      <h2 id="h-tips" className="font-semibold">
        Getting more students to answer
      </h2>
      <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm text-ink-2 sm:grid-cols-2">
        <li>• Leave the QR up for the last 2 minutes, not after the bell.</li>
        <li>• Start the next class by saying what you changed because of their feedback.</li>
        <li>• Remind them it&apos;s anonymous and takes one tap.</li>
        <li>• Ask the same way every class so it becomes a habit.</li>
      </ul>
    </section>
  );
}

function SaveLinkBanner({
  adminKey,
  courseName,
  code,
  onDone,
}: {
  adminKey: string;
  courseName: string;
  code: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = dashboardUrl(adminKey);
  return (
    <section role="region" aria-label="Save your private link" className="rounded-2xl border-2 border-brand bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">🎉 Your course is ready. Save this page&apos;s link now.</h2>
      <p className="mt-1 text-sm text-ink-2">
        There&apos;s no password. This private link is how you get back to your results, and this browser also
        remembers it under &ldquo;Your courses&rdquo;. Don&apos;t share it with students. They use the QR code.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            if (await copyText(url)) setCopied(true);
          }}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover"
        >
          {copied ? "Copied ✓" : "Copy private link"}
        </button>
        <a
          href={`mailto:?subject=${encodeURIComponent(`Class Feedback dashboard: ${courseName}`)}&body=${encodeURIComponent(
            `My private dashboard for ${courseName}:\n\n${url}\n\nStudent code: ${code}`,
          )}`}
          className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Email it to myself
        </a>
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink">
          I&apos;ve saved it
        </button>
      </div>
    </section>
  );
}

function NoKey() {
  const [courses, setCourses] = useState<ReturnType<typeof getSavedCourses>>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCourses(getSavedCourses()), []);
  return (
    <Message
      title="Open your private dashboard link"
      body="Each course has its own private link. You got it when you created the course. Check your bookmarks or the email you sent yourself."
    >
      {courses.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line text-left">
          {courses.map((c) => (
            <li key={c.key}>
              <a href={`/manage#k=${c.key}`} className="flex justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="truncate font-medium">{c.name}</span>
                <span className="font-mono text-sm text-muted">{c.code}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <Link href="/#teachers" className="mt-5 inline-block text-sm font-medium text-brand hover:underline">
        Create a new course →
      </Link>
    </Message>
  );
}

function InvalidKey({ adminKey }: { adminKey: string | null }) {
  const router = useRouter();
  const known = adminKey ? getSavedCourses().some((c) => c.key === adminKey) : false;
  return (
    <Message
      title="This dashboard link doesn't work"
      body={
        known
          ? "This course may have been deleted."
          : "Check that you copied the whole link. It's long, and the part after # matters."
      }
    >
      {known && adminKey && (
        <button
          type="button"
          onClick={() => {
            forgetCourse(adminKey);
            router.push("/");
          }}
          className="mt-4 rounded-xl border border-line-strong px-4 py-2 text-sm font-medium"
        >
          Remove it from this device
        </button>
      )}
    </Message>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-ink-2">{body}</p>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading results" className="animate-pulse space-y-6">
      <div className="h-9 w-2/3 rounded-lg bg-surface-2" />
      <div className="h-44 rounded-2xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-32 rounded-2xl bg-surface-2" />
        <div className="h-32 rounded-2xl bg-surface-2" />
        <div className="h-32 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
