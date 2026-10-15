"use client";

import { useEffect, useState } from "react";
import { copyText, isLocalOnly, siteOrigin, studentUrl } from "@/lib/client";
import { downloadQrPng, downloadSlidePng, qrSvg } from "@/lib/qr";

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-2";

export function ShareCard({ code, name }: { code: string; name: string }) {
  const [svg, setSvg] = useState("");
  const [url, setUrl] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const u = studentUrl(code);
    /* eslint-disable react-hooks/set-state-in-effect */
    setUrl(u);
    setLocalOnly(isLocalOnly());
    /* eslint-enable react-hooks/set-state-in-effect */
    qrSvg(u).then(setSvg);
  }, [code]);

  return (
    <section aria-labelledby="share" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <a
          href={`/present/${code}`}
          target="_blank"
          rel="noopener"
          title="Open the projector view"
          className="block size-32 shrink-0 self-center rounded-xl border border-line bg-white p-2.5 sm:self-auto [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 flex-1">
          <h2 id="share" className="font-semibold">
            Collect feedback
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Show this at the end of class. The QR and code <strong className="font-semibold text-ink">never change</strong>,
            so you can add the slide to your template once and reuse it all semester.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-muted">{url}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/present/${code}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover"
            >
              Show on projector ↗
            </a>
            <button
              type="button"
              className={btn}
              onClick={() =>
                downloadSlidePng({ url, code, name, host: siteOrigin().replace(/^https?:\/\//, "") })
              }
            >
              Download slide
            </button>
            <button type="button" className={btn} onClick={() => downloadQrPng(url, name)}>
              Download QR
            </button>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                if (await copyText(url)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? "Copied ✓" : "Copy student link"}
            </button>
          </div>
        </div>
      </div>
      {localOnly && (
        <p className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">
          You&apos;re running on <strong>localhost</strong>. Students&apos; phones can&apos;t open this QR yet. Deploy
          the app first (see the README), or set <code>NEXT_PUBLIC_SITE_URL</code>.
        </p>
      )}
    </section>
  );
}
