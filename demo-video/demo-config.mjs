import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEMO = {
  // `.test` is reserved (RFC 6761), so the QR in the video can never point at a real site.
  host: "classfeedback.test",
  port: 3457, // the browser sees http://classfeedback.test; Playwright proxies it here
  dataDir: path.join(here, ".data", "pglite"),
  appDir: path.join(here, ".."),
  outDir: path.join(here, "out"),
  courseId: "demoCourse01",
  code: "K7P2QX",
  adminKey: "demoAdminKey_ClassFeedback_2026xx",
  courseName: "Data Structures — CSE A",
  instructor: "Dr. Rao",
  classSize: 42,
};

// Today's class: 33 classmates answer in the background while we film one phone.
export const TODAY = {
  ratings: [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5],
  // -1 slow, 0 right, 1 fast
  paces: [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, -1, 0, 1, 0, 0, -1, 0, 0, -1, 1],
  comments: {
    0: "Lost after the adjacency list slide, it went too fast",
    1: "How do we detect a cycle using DFS?",
    2: "Can you redo the visited[] array example step by step?",
    4: "Why does DFS use a stack but BFS uses a queue?",
    5: "DFS లో backtracking అర్థం కాలేదు",
    7: "Why is it O(V + E) and not O(V × E)?",
    9: "Too many examples at the end, needed more time on DFS",
    12: "When should I use BFS instead of DFS?",
    15: "What happens with disconnected graphs?",
    19: "Is the order of neighbours important in BFS?",
    30: "The BFS level-by-level animation really helped!",
  },
};
