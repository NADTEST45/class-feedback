"use client";

// Browser storage can be missing or throw (private mode, blocked cookies, in-app browsers).
// Every read/write goes through these so the app keeps working without it.
export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: the app still works, just forgets */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

function randomId(): string {
  // crypto.getRandomValues works on plain-http LAN addresses too, unlike randomUUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * A random, anonymous id for this browser. Lets a student change their answer
 * instead of adding a second one. Kept in localStorage and a cookie, so clearing one isn't enough.
 */
export function getDeviceId(): string {
  let id = store.get<string>("cf:device") ?? readCookie("cf_device");
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) id = randomId();
  store.set("cf:device", id);
  document.cookie = `cf_device=${id}; max-age=${60 * 60 * 24 * 400}; path=/; samesite=lax`;
  return id;
}

export type SavedCourse = { code: string; name: string; key: string; savedAt: number };

export function getSavedCourses(): SavedCourse[] {
  const list = store.get<SavedCourse[]>("cf:courses");
  return Array.isArray(list) ? list.filter((c) => c && c.key && c.code) : [];
}

export function saveCourse(course: Omit<SavedCourse, "savedAt">) {
  const rest = getSavedCourses().filter((c) => c.key !== course.key);
  store.set("cf:courses", [{ ...course, savedAt: Date.now() }, ...rest]);
}

export function forgetCourse(key: string) {
  store.set(
    "cf:courses",
    getSavedCourses().filter((c) => c.key !== key),
  );
}

/** Public base URL for QR codes. Set NEXT_PUBLIC_SITE_URL if the app sits behind a proxy. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
}

export function studentUrl(code: string): string {
  return `${siteOrigin()}/f/${code}`;
}

export function dashboardUrl(key: string): string {
  return `${window.location.origin}/manage#k=${key}`;
}

/** True when the QR code would point at an address students' phones can't reach. */
export function isLocalOnly(): boolean {
  try {
    const host = new URL(siteOrigin()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for http:// origins where the async clipboard API is unavailable.
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(text: string): string {
  return text.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "class";
}
