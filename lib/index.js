// dsh-hirame — host half.
//
// A thin DeepSeek Harness plugin that points dsh sessions at the same
// file-based memory ZCode / Claude Code use. The plugin itself is stateless:
// the md files under the memory root are the only state in the system.
//
// Two injection mechanisms, no tools, no database:
//   1. a constant contract section in the system prompt (KV-cache friendly),
//   2. a one-shot snapshot message before the first real user message that
//      carries the memory root path and the MEMORY.md index,
//      re-injected once after each compaction.
// Reads and writes go through the agent's native file tools.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Schema from "@deepseek-ai/schemastery";

import { defaultMemoryRoot, formatMemoryIndexContent } from "./core.js";

const name = "dsh-hirame";
const inject = ["systemPrompt"];
const PLUGIN_KIND = `plugin:${name}`;
const SECTION_NAME = `${name}:guide`;
const SECTION_ORDER = 130;

const FIRST_TURN_TRACK_CAP = 2048;

export const Config = Schema.object({
  /** Master switch: false disables the section, snapshot and re-injection. */
  enabled: Schema.boolean().default(true),
  /** Memory root override. Empty/undefined = resolve the ZCode-compatible
   *  per-workspace root (~/.zcode/cli/memories/projects/<slug>-<hash>/memory)
   *  from the session cwd. Also readable via DSH_HIRAME_MEMORY_ROOT. */
  memoryRoot: Schema.string().required(false),
});

const GUIDE_TEXT = [
  "# Memory",
  "",
  'You have a persistent file-based memory. At the start of each session a "Memory (dsh-hirame)" snapshot message is injected before your first message — its header names the memory root directory and includes the full MEMORY.md index. Read individual memory files under that root on demand with the Read tool when the index points to something relevant.',
  "",
  "Each memory is one file holding one fact, with frontmatter:",
  "",
  "```markdown",
  "---",
  "name: <short-kebab-case-slug>",
  "description: <one-line summary — used to decide relevance during recall>",
  "metadata:",
  "  type: user | feedback | project | reference",
  "---",
  "",
  "<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>",
  "```",
  "",
  "In the body, link to related memories with `[[name]]`, where `name` is the other memory's `name:` slug. Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine; it marks something worth writing later, not an error.",
  "",
  "`user` — who the user is (role, expertise, preferences). `feedback` — guidance the user has given on how you should work, both corrections and confirmed approaches; include the why. `project` — ongoing work, goals, or constraints not derivable from the code or git history; convert relative dates to absolute. `reference` — pointers to external resources (URLs, dashboards, tickets).",
  "",
  "After writing the file, add a one-line pointer in `MEMORY.md` (`- [Title](file.md) — hook`). `MEMORY.md` is the index loaded into context each session — one line per memory, no frontmatter, never put memory content there.",
  "",
  "Before saving, check for an existing file that already covers it — update that file rather than creating a duplicate; delete memories that turn out to be wrong. Don't save what the repo already records (code structure, past fixes, git history, AGENTS.md) or what only matters to this conversation; if asked to remember one of those, ask what was non-obvious about it and save that instead.",
].join("\n");

export function apply(ctx, config = {}) {
  if (config?.enabled === false) return;

  const override =
    (typeof config?.memoryRoot === "string" && config.memoryRoot.trim()) ||
    (process.env.DSH_HIRAME_MEMORY_ROOT ?? "").trim() ||
    "";

  const resolveRoot = (cwd) => (override ? override : defaultMemoryRoot(cwd));

  // 1) constant contract section — text never varies, so provider KV caches
  //    stay valid across turns and sessions.
  try {
    const disposeSection = ctx.systemPrompt?.section?.({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: GUIDE_TEXT,
    });
    if (typeof disposeSection === "function") {
      ctx.effect(() => disposeSection, "dsh-hirame: guide section");
    }
  } catch (error) {
    ctx.logger?.warn?.(`dsh-hirame: section registration failed: ${describe(error)}`);
  }

  // session cwd + id -> re-inject on next pre-step (armed by compaction/end)
  const reinjectPending = new Map();
  // sessions whose first turn already got the snapshot
  const firstTurnDone = new Set();

  // 2a) compaction signals arm the one-shot re-injection.
  ctx.on("session/event", (session, event) => {
    const type = event?.type;
    if (
      type !== "compaction/summary" &&
      type !== "compaction/start" &&
      type !== "compaction/end"
    ) {
      return;
    }
    const sid = session?.id;
    const cwd = session?.header?.cwd;
    if (typeof sid !== "string" || typeof cwd !== "string") return;
    const key = `${cwd}\u0000${sid}`;
    if (type === "compaction/end" && !event?.data?.error) {
      reinjectPending.set(key, true);
      ctx.logger?.info?.(`dsh-hirame: compaction finished, index re-injection armed for session ${sid}`);
    } else if (type !== "compaction/end") {
      reinjectPending.delete(key);
    }
  });

  // 2b) snapshot insertion before the first real user message.
  ctx.on("agent/pre-step", async ({ agent, signal }, next) => {
    const decision = await next();
    try {
      if (!decision || decision.kind !== "enter" || signal?.aborted) return decision;
      const messages = decision.messages;
      if (!Array.isArray(messages) || messages.length === 0) return decision;

      const header = agent?.session?.header;
      if (header?.origin === "subagent") return decision;
      const cwd = header?.cwd;
      if (typeof cwd !== "string" || cwd.length === 0) return decision;
      const sid = typeof header?.id === "string" && header.id ? header.id : "unknown";

      const userMessages = messages.filter((m) => m?.source?.kind === "user");
      if (userMessages.length === 0) return decision;

      const key = `${cwd}\u0000${sid}`;
      const root = resolveRoot(cwd);

      if (reinjectPending.get(key)) {
        reinjectPending.delete(key);
        const text = buildSnapshotText(root);
        if (text) {
          ctx.logger?.info?.(`dsh-hirame: post-compaction index re-injected (${text.length} chars)`);
          return insertBefore(decision, userMessages[userMessages.length - 1], text);
        }
        return decision;
      }

      if (!firstTurnDone.has(key)) {
        trackFirstTurn(firstTurnDone, key);
        if (countPriorUserMessages(agent?.session) === 0) {
          const text = buildSnapshotText(root);
          if (text) {
            ctx.logger?.info?.(
              `dsh-hirame: inserted memory snapshot (${text.length} chars) before first user message, root=${root}`,
            );
            return insertBefore(decision, userMessages[0], text);
          }
        }
      }
      return decision;
    } catch (error) {
      try {
        ctx.logger?.warn?.(`dsh-hirame: pre-step injection failed (fail-open): ${describe(error)}`);
      } catch {}
      return decision;
    }
  });
}

function trackFirstTurn(set, key) {
  if (set.size >= FIRST_TURN_TRACK_CAP) {
    set.delete(set.values().next().value);
  }
  set.add(key);
}

function countPriorUserMessages(session) {
  let events;
  try {
    events = typeof session?.ownEvents === "function" ? session.ownEvents() : session?.events;
  } catch {
    return 0;
  }
  if (!Array.isArray(events)) return 0;
  let count = 0;
  for (const event of events) {
    if (event?.type === "user/message" && event?.data?.source?.kind === "user") count++;
  }
  return count;
}

function buildSnapshotText(root) {
  // Always name the root: in a fresh workspace the model must know where to
  // start writing even when no index exists yet (ZCode's contract section
  // carries the path; here the snapshot is the path carrier).
  let index = "";
  try {
    index = formatMemoryIndexContent(readFileSync(join(root, "MEMORY.md"), "utf8"));
  } catch {
    index = "";
  }
  if (!index) {
    return [
      "# Memory (dsh-hirame)",
      "",
      "Memory root: `" + root + "`",
      "",
      "The `MEMORY.md` index does not exist yet — this workspace has no memories so far. When you learn something worth remembering, create memory files under the root and start the index.",
    ].join("\n");
  }
  return [
    "# Memory (dsh-hirame)",
    "",
    "Memory root: `" + root + "`",
    "",
    "`MEMORY.md` index (one line per memory file; Read individual files for details):",
    "",
    index,
  ].join("\n");
}

function insertBefore(decision, userMessage, text) {
  const index = decision.messages.indexOf(userMessage);
  if (index < 0) return decision;
  const messages = [...decision.messages];
  messages.splice(index, 0, createSnapshotMessage(text));
  return { ...decision, messages };
}

function createSnapshotMessage(text) {
  const message = {
    role: "user",
    id: randomUUID(),
    content: [{ type: "text", text }],
    source: {
      kind: PLUGIN_KIND,
      form: "snapshot",
      sections: [
        { name: "__meta__", text: JSON.stringify({ kind: "initial-or-reinjection" }) },
        { name: "Memory", text },
      ],
    },
  };
  return deepFreeze(structuredClone(message));
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const property of Object.values(value)) deepFreeze(property);
    Object.freeze(value);
  }
  return value;
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

export { inject, name };
