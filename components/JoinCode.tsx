"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CODE_LENGTH, isValidCode, normalizeCode } from "@/lib/shared";

export function JoinCode({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (!isValidCode(clean)) {
      setError(`Class codes are ${CODE_LENGTH} letters and numbers, like K7P2QX.`);
      return;
    }
    router.push(`/f/${clean}`);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="join-code" className="block text-sm font-medium text-ink-2">
        Class code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="join-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={10}
          placeholder="K7P2QX"
          aria-invalid={!!error}
          aria-describedby={error ? "join-code-error" : undefined}
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-4 py-3 font-mono text-xl tracking-[0.2em] uppercase text-ink placeholder:text-muted/50 focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
        >
          Go
        </button>
      </div>
      {error && (
        <p id="join-code-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
