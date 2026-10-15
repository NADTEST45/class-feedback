"use client";

import { useEffect, useState } from "react";
import { isLocalOnly, siteOrigin, studentUrl } from "@/lib/client";
import { qrSvg } from "@/lib/qr";

export function Presenter({ code, name }: { code: string; name: string }) {
  const [svg, setSvg] = useState("");
  const [host, setHost] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    qrSvg(studentUrl(code)).then(setSvg);
    /* eslint-disable react-hooks/set-state-in-effect */
    setHost(siteOrigin().replace(/^https?:\/\//, ""));
    setLocalOnly(isLocalOnly());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [code]);

  // Live counter: a little social proof ("23 classmates answered") lifts response rates.
  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/live/${code}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped) {
          setCount(data.count);
          setIsOpen(data.isOpen);
        }
      } catch {
        /* keep showing the last number */
      }
    }
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [code]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  return (
    // Always light: projectors wash out dark backgrounds and phones scan dark-on-light best.
    <div
      className="flex min-h-dvh flex-col bg-white text-[#0b0b0b]"
      style={{ colorScheme: "light" }}
    >
      <div className="no-print flex items-center justify-between gap-3 px-6 py-4 text-sm text-[#52514e]">
        <span className="truncate">{name}</span>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="shrink-0 rounded-lg border border-[#c3c2b7] px-3 py-1.5 font-medium hover:bg-[#f6f6f3]"
        >
          Full screen
        </button>
      </div>

      {localOnly && (
        <p className="no-print mx-6 rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#7a4f00]">
          This QR points to <strong>{host}</strong>, which students&apos; phones can&apos;t open. Deploy the app
          (see README) or set NEXT_PUBLIC_SITE_URL before using it in class.
        </p>
      )}

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-10 lg:flex-row lg:gap-20">
        <div
          role="img"
          aria-label={`QR code linking to the feedback form for ${name}`}
          className="aspect-square w-[min(80vw,62vh)] [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="max-w-xl text-center lg:text-left">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">How did today&apos;s class go?</h1>
          <p className="mt-4 text-xl text-[#52514e] sm:text-2xl">Scan to answer. Anonymous, 20 seconds.</p>
          <div className="mt-10">
            <p className="text-lg text-[#6f6d68]">
              No camera? Go to <span className="font-semibold text-[#0b0b0b]">{host}</span> and enter
            </p>
            <p className="mt-2 font-mono text-6xl font-bold tracking-[0.15em] text-[#1c5cab] sm:text-8xl">
              {code}
            </p>
          </div>
          <p aria-live="polite" className="mt-10 text-2xl font-medium">
            {!isOpen ? (
              <span className="text-[#c0302f]">Feedback is paused, so answers aren&apos;t being collected.</span>
            ) : count === null ? (
              " "
            ) : count === 0 ? (
              <span className="text-[#6f6d68]">Be the first to answer</span>
            ) : (
              <>
                <span className="mr-2 inline-block size-3 animate-pulse rounded-full bg-[#0ca30c] align-middle" />
                {count} {count === 1 ? "classmate has" : "classmates have"} answered
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
