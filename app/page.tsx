import { CreateCourse } from "@/components/CreateCourse";
import { JoinCode } from "@/components/JoinCode";
import { Logo } from "@/components/Logo";
import { MyCourses } from "@/components/MyCourses";
import { RATINGS } from "@/lib/shared";

const STEPS = [
  {
    title: "Create your course once",
    body: "Name it and you're done. No account, no setup, no IT ticket.",
  },
  {
    title: "Put the QR on your last slide",
    body: "Download a ready-made slide. The same QR works all semester, so set it and forget it.",
  },
  {
    title: "Read it before your next class",
    body: "Responses group by class day. See how many got lost, whether the pace worked, and what is still unclear.",
  },
];

const GUARANTEES = [
  ["Anonymous by design", "No names, emails or logins. Students answer honestly."],
  ["One tap counts", "The first tap is saved instantly, even if the student closes the page."],
  ["One voice per student", "Each browser gets one response per class. Changing an answer updates it."],
  ["Works on any phone", "No app to install. If the connection drops, the answer is kept and retried."],
  ["Same QR all semester", "Responses are filed under the right class day automatically."],
  ["Your data, exportable", "Download everything as a spreadsheet whenever you want."],
];

export default function Home() {
  return (
    <div className="flex-1">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <a href="#teachers" className="text-sm font-medium text-ink-2 hover:text-ink">
          For teachers
        </a>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <section className="pt-6 pb-10 sm:pt-12 sm:pb-14">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Find out what didn&apos;t land, before your next class.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-2 text-pretty">
            One QR code on your last slide. Students answer three quick questions anonymously, in under 20
            seconds. You see the results right away.
          </p>
          <div aria-hidden="true" className="mt-6 flex gap-2 text-3xl">
            {RATINGS.map((r) => (
              <span key={r.value}>{r.emoji}</span>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          <section
            aria-labelledby="students"
            className="h-fit rounded-2xl border border-line bg-surface p-5 sm:p-6"
          >
            <h2 id="students" className="text-lg font-semibold">
              Student?
            </h2>
            <p className="mt-1 text-sm text-ink-2">Scan the QR in class, or type the code on the screen.</p>
            <div className="mt-4">
              <JoinCode />
            </div>
          </section>

          <div className="space-y-6">
            <MyCourses />
            <section
              id="teachers"
              aria-labelledby="create"
              className="scroll-mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6"
            >
              <h2 id="create" className="text-lg font-semibold">
                Teacher? Set up a course in 30 seconds
              </h2>
              <div className="mt-4">
                <CreateCourse />
              </div>
            </section>
          </div>
        </div>

        <section aria-labelledby="how" className="mt-16">
          <h2 id="how" className="text-2xl font-bold tracking-tight">
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-surface p-5">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="questions" className="mt-16 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 id="questions" className="text-2xl font-bold tracking-tight">
              Three questions. That&apos;s the whole form.
            </h2>
            <p className="mt-3 text-ink-2">
              Short forms get answered. Each question is something you can act on before the next class.
            </p>
          </div>
          <ol className="space-y-3">
            {[
              ["How well did you follow today's class?", "Five faces, one tap. Shows how many got lost."],
              ["The pace was…", "Too slow, just right or too fast."],
              ["What's one thing that's still unclear?", "Optional free text. You can change the wording."],
            ].map(([q, hint], i) => (
              <li key={q} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
                <span className="font-mono text-sm text-muted">{i + 1}</span>
                <div>
                  <p className="font-medium">{q}</p>
                  <p className="text-sm text-ink-2">{hint}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="foolproof" className="mt-16">
          <h2 id="foolproof" className="text-2xl font-bold tracking-tight">
            Built for real classrooms
          </h2>
          <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {GUARANTEES.map(([title, body]) => (
              <div key={title}>
                <dt className="font-semibold">{title}</dt>
                <dd className="mt-1 text-sm text-ink-2">{body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        Class Feedback · anonymous feedback after every class
      </footer>
    </div>
  );
}
