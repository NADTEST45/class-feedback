import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Presenter } from "@/components/Presenter";
import { findCourseByCode } from "@/lib/server";
import { isValidCode, normalizeCode } from "@/lib/shared";

export const metadata: Metadata = {
  title: "Show QR",
  robots: { index: false, follow: false },
};

export default function PresentPage({ params }: PageProps<"/present/[code]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <PresentLoader params={params} />
    </Suspense>
  );
}

async function PresentLoader({ params }: { params: PageProps<"/present/[code]">["params"] }) {
  await connection();
  const code = normalizeCode((await params).code);
  const course = isValidCode(code) ? await findCourseByCode(code) : null;
  if (!course) {
    return (
      <main className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Course not found</h1>
        <p className="mt-2 text-ink-2">Open this screen from your course dashboard.</p>
      </main>
    );
  }
  return <Presenter code={course.code} name={course.name} />;
}
