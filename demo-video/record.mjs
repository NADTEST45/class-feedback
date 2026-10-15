// Records a captioned product demo of Class Feedback, driving the real app end to end.
//   npm run record            -> out/class-feedback-demo.mp4 (1920x1080, H.264)
// Requires: Google Chrome installed, the app built (`npm run build` in the repo root).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { chromium } from "playwright";
import { DEMO, TODAY } from "./demo-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = `http://${DEMO.host}`;
const LOCAL = `http://127.0.0.1:${DEMO.port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Fresh, seeded demo server ----------
fs.rmSync(path.join(here, ".data"), { recursive: true, force: true });
execFileSync(process.execPath, ["--no-warnings", "seed.mjs"], { cwd: here, stdio: ["ignore", "inherit", "inherit"] });

const server = spawn(
  path.join(DEMO.appDir, "node_modules", ".bin", "next"),
  ["start", "-H", "127.0.0.1", "-p", String(DEMO.port)],
  // DATABASE_URL="" overrides any .env file, so the demo never writes to a real database.
  { cwd: DEMO.appDir, env: { ...process.env, PGLITE_DIR: DEMO.dataDir, DATABASE_URL: "" }, stdio: ["ignore", "ignore", "pipe"] },
);
server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
const stopServer = () => server.exitCode === null && server.kill("SIGTERM");
process.on("exit", stopServer);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${LOCAL}/api/health`)).ok) break;
  } catch {}
  if (i > 60) throw new Error("Demo server didn't start");
  await sleep(500);
}
console.log("Demo server ready");

// ---------- 2. Browser + stage ----------
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  colorScheme: "light",
});

// Serve http://classfeedback.test from the local demo server. The app sends X-Frame-Options: DENY
// (right for production); for filming it's framed inside the stage, so drop that header here.
await context.route(`${ORIGIN}/**`, async (route) => {
  const req = route.request();
  const resp = await route.fetch({ url: req.url().replace(ORIGIN, LOCAL) });
  const headers = resp.headers();
  delete headers["x-frame-options"];
  await route.fulfill({ response: resp, headers });
});
await context.route(`${ORIGIN}/__stage`, (route) =>
  route.fulfill({ contentType: "text/html; charset=utf-8", body: fs.readFileSync(path.join(here, "stage.html"), "utf8") }),
);

const page = await context.newPage();
await page.goto(`${ORIGIN}/__stage`);

const stage = {
  show: (id) => page.evaluate((id) => window.stage.show(id), id),
  caption: (html) => page.evaluate((h) => window.stage.caption(h), html),
  hideCursor: () => page.evaluate(() => window.stage.hideCursor()),
  load: (id, src) => page.evaluate(([id, src]) => (document.getElementById(id).src = src), [id, src]),
};
const frameOf = async (sel) => (await page.$(sel)).contentFrame();

async function point(locator, mode = "arrow") {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([x, y, m]) => window.stage.cursor(x, y, m), [x, y, mode]);
  await sleep(850);
  return { x, y };
}
async function tap(locator, mode = "arrow") {
  const { x, y } = await point(locator, mode);
  await page.evaluate(([x, y]) => window.stage.ripple(x, y), [x, y]);
  await locator.click();
  if (mode === "touch") {
    await sleep(350);
    await page.evaluate(() => window.stage.hideCursor()); // a finger lifts; don't hide what was tapped
  }
}
async function smoothScroll(frame, selector, offset = 16) {
  await frame.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
    },
    [selector, offset],
  );
  await sleep(1100);
}

// ---------- 3. Film it (CDP screencast -> JPEG frames with timestamps) ----------
const framesDir = path.join(DEMO.outDir, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = path.join(framesDir, `f${String(frames.length).padStart(5, "0")}.jpg`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, ts: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

// Preload the teacher's browser while the title plays.
await stage.load("teacher-frame", `${ORIGIN}/`);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080 });
await sleep(300);

// Scene: title
await stage.show("title");
await sleep(4200);

// Scene: teacher creates a course
const T = page.frameLocator("#teacher-frame");
await T.locator("#cc-name").waitFor();
const tFrame = await frameOf("#teacher-frame");
await stage.show("teacher");
await stage.caption("Teachers set up a course in <b>30 seconds</b>. No sign-up.");
await sleep(1300);
await smoothScroll(tFrame, "#teachers", 40);
await tap(T.locator("#cc-name"));
await T.locator("#cc-name").pressSequentially(DEMO.courseName, { delay: 45 });
await tap(T.locator("#cc-instructor"));
await T.locator("#cc-instructor").pressSequentially(DEMO.instructor, { delay: 55 });
await tap(T.locator("#cc-size"));
await T.locator("#cc-size").pressSequentially(String(DEMO.classSize), { delay: 90 });
// The course already exists in the seeded database (with weeks of history for later scenes),
// so answer the create call with it. Everything else on screen is the live app.
await page.route(`${ORIGIN}/api/courses`, (route) =>
  route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ id: DEMO.courseId, code: DEMO.code, key: DEMO.adminKey, name: DEMO.courseName }),
  }),
);
await tap(T.getByRole("button", { name: /Create course/ }));
await page.evaluate(() => (document.getElementById("teacher-url").textContent = "classfeedback.test/manage"));
await T.getByText("Your course is ready").waitFor();
await stage.hideCursor();
await stage.caption("You get a private dashboard and a QR code that <b>never changes</b>.");
await sleep(2600);

// Download slide -> show it dropped into a deck
await tFrame.evaluate(() => {
  URL.revokeObjectURL = () => {};
  const original = HTMLElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) return parent.postMessage({ slide: this.href }, "*");
    return original.call(this);
  };
});
await tap(T.getByRole("button", { name: "Download slide" }));
await page.waitForFunction(() => window.__slide);
await stage.hideCursor();
await page.evaluate(() => window.stage.showSlide(window.__slide));
await stage.caption("Drop the ready-made slide at the end of <b>every lecture</b>.");
await sleep(3800);

// Scene: time skip (preload the classroom meanwhile)
await stage.caption(null);
await stage.load("projector-frame", `${ORIGIN}/present/${DEMO.code}`);
await stage.load("phone-frame", `${ORIGIN}/f/${DEMO.code}`);
await stage.show("later");
const P = page.frameLocator("#phone-frame");
await Promise.all([
  P.getByRole("radio", { name: "Shaky" }).waitFor(),
  page.frameLocator("#projector-frame").getByText("Be the first to answer").waitFor(),
  sleep(3600),
]);

// Scene: classroom — projector + one student's phone, while 33 classmates answer too
await stage.show("classroom");
await stage.caption("End of class: put the QR on screen for the <b>last 2 minutes</b>.");
await sleep(2700);

const classmates = (async () => {
  for (let i = 0; i < TODAY.ratings.length; i++) {
    await fetch(`${LOCAL}/api/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: DEMO.code,
        deviceId: `demo-classmate-${String(i).padStart(3, "0")}-abcdef`,
        rating: TODAY.ratings[i],
        pace: TODAY.paces[i],
        comment: TODAY.comments[i] ?? null,
      }),
    });
    await sleep(330);
  }
})();

await stage.caption("Students scan it. <b>No app, no login</b>, fully anonymous.");
await sleep(1500);
await tap(P.getByRole("radio", { name: "Shaky" }), "touch");
await stage.caption("One tap and the answer is <b>already saved</b>.");
await sleep(1500);
await tap(P.getByRole("radio", { name: "Too fast" }), "touch");
await sleep(500);
await tap(P.locator("#comment"), "touch");
await P.locator("#comment").pressSequentially("I didn't get how the recursion unwinds in DFS", { delay: 36 });
await sleep(300);
await tap(P.getByRole("button", { name: "Send feedback" }), "touch");
await P.getByText("Thanks, got it!").waitFor();
await stage.hideCursor();
await stage.caption("The projector counts answers live, so <b>more students join in</b>.");
await classmates;
await sleep(4800);

// Scene: teacher dashboard
await stage.caption(null);
await stage.load("dash-frame", `${ORIGIN}/manage#k=${DEMO.adminKey}`);
const D = page.frameLocator("#dash-frame");
await D.getByText("Average understanding", { exact: true }).waitFor();
const dFrame = await frameOf("#dash-frame");
await stage.show("dashboard");
await stage.caption("Minutes later, the teacher sees <b>how the class really went</b>.");
await sleep(2200);
await stage.caption("How many got lost, and whether the pace worked, <b>at a glance</b>.");
await smoothScroll(dFrame, "select", 64);
await sleep(4000);
await stage.caption("Every “still unclear” comment, <b>most confused students first</b>.");
await smoothScroll(dFrame, "#h-comments", 28);
await sleep(4200);
await stage.caption("Track every class all semester, and <b>export it all</b> to a spreadsheet.");
await smoothScroll(dFrame, "#h-sessions", 28);
await sleep(600);
const dots = D.locator("#h-sessions ~ div svg circle");
for (const i of [8, 9, 10]) {
  const box = await dots.nth(i).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => window.stage.cursor(x, y), [x, y]);
  await sleep(700);
  await page.mouse.move(x, y, { steps: 6 });
  await sleep(1000);
}
await sleep(1200);

// Scene: end card
await stage.hideCursor();
await stage.caption(null);
await stage.show("end");
await sleep(5600);

const endTs = Date.now() / 1000;
await cdp.send("Page.stopScreencast");
await browser.close();
stopServer();

// ---------- 4. Encode ----------
console.log(`Captured ${frames.length} frames`);
const list = [];
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
  list.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
});
list.push(`file '${frames.at(-1).file}'`);
const listFile = path.join(DEMO.outDir, "frames.txt");
fs.writeFileSync(listFile, list.join("\n"));

const out = path.join(DEMO.outDir, "class-feedback-demo.mp4");
execFileSync(
  ffmpeg,
  [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
    "-movflags", "+faststart",
    out,
  ],
  { stdio: "inherit" },
);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.rmSync(listFile, { force: true });
console.log(`Saved ${out}`);
process.exit(0);
