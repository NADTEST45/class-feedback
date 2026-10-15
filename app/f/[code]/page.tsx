import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FeedbackForm } from "@/components/FeedbackForm";
import { JoinCode } from "@/components/JoinCode";
import { LogoMark } from "@/components/Logo";
import { findCourseByCode } from "@/lib/server";
import { isValidCode, normalizeCode } from "@/lib/shared";

export const metadata: Metadata = {
  title: "Give feedback",
  robots: { index: false, follow: false },
};

export default function StudentPage({ params }: PageProps<"/f/[code]">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-5 pb-6">
      <Suspense fallback={<FormSkeleton />}>
        <StudentForm params={params} />
      </Suspense>
      <footer className="mt-auto flex items-center justify-center gap-1.5 pt-6 text-xs text-muted">
        <LogoMark size={14} />
        <Link href="/" className="hover:text-ink">
          Class Feedback
        </Link>
      </footer>
    </div>
  );
}

async function StudentForm({ params }: { params: PageProps<"/f/[code]">["params"] }) {
  // Always render per request: the course can be paused or renamed at any moment.
  await connection();
  const raw = (await params).code;
  const code = normalizeCode(decodeURIComponent(raw));
  const course = isValidCode(code) ? await findCourseByCode(code) : null;

  if (!course) {
    return (
      <div className="py-8">
        <h1 className="text-2xl font-bold">We couldn&apos;t find that class</h1>
        <p className="mt-2 text-ink-2">
          Check the code on the screen and try again. Codes use letters and numbers, like K7P2QX.
        </p>
        <div className="mt-6">
          <JoinCode />
        </div>
      </div>
    );
  }

  if (!course.isOpen) {
    return (
      <div className="py-8">
        <p className="text-sm text-muted">{course.instructor}</p>
        <h1 className="mt-1 text-2xl font-bold">{course.name}</h1>
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-ink-2">
          Feedback for this course is paused right now. Your teacher will reopen it when they&apos;re ready.
        </p>
      </div>
    );
  }

  return (
    <FeedbackForm
      course={{
        code: course.code,
        name: course.name,
        instructor: course.instructor,
        openQuestion: course.openQuestion,
        timezone: course.timezone,
        today: course.today,
      }}
    />
  );
}

function FormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-4 w-32 rounded bg-surface-2" />
      <div className="mt-3 h-7 w-3/4 rounded bg-surface-2" />
      <div className="mt-10 h-5 w-2/3 rounded bg-surface-2" />
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
