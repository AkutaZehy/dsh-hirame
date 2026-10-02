// dsh-hirame core: pure functions, no host imports, unit-testable with node:test.
//
// The storage contract is byte-compatible with ZCode / Claude Code auto memory:
//   ~/.zcode/cli/memories/projects/<slug>-<hash>/memory/
//     MEMORY.md          one-line-per-file index (authoritative data)
//     <slug>.md          one fact per file, frontmatter name/description/type

import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import { homedir } from "node:os";

// ── memory root resolution ─────────────────────────────────────────────
// Ported from ZCode apps/zcode-cli/packages/core/src/memory/project-root.ts.
// The bucket name must match ZCode exactly so both harnesses land on the
// same directory: sha256 of the resolved path (lowercased on win32), first
// 16 hex chars, prefixed by a sanitized basename slug.
//
// Path semantics are selected per-platform explicitly (path.win32 vs
// path.posix) instead of the host-default path module: resolution must not
// depend on the machine running the code, or the same workspace would hash
// differently on Windows vs Linux CI.

export function sanitizeProjectSlug(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "project";
}

export function projectBucketName(workspacePath, platform = process.platform) {
  const pathImpl = platform === "win32" ? win32 : posix;
  const normalized = pathImpl.resolve(workspacePath);
  const keySource = platform === "win32" ? normalized.toLowerCase() : normalized;
  const hash = createHash("sha256").update(keySource).digest("hex").slice(0, 16);
  return `${sanitizeProjectSlug(pathImpl.basename(normalized) || "project")}-${hash}`;
}

export function defaultMemoryRoot(
  workspacePath,
  { home = homedir(), platform = process.platform } = {},
) {
  const pathImpl = platform === "win32" ? win32 : posix;
  return pathImpl.join(home, ".zcode", "cli", "memories", "projects", projectBucketName(workspacePath, platform), "memory");
}

// ── MEMORY.md index formatting ─────────────────────────────────────────
// Ported from ZCode apps/zcode-cli/packages/core/src/memory/index-content.ts.
// Strip leading frontmatter and top-level HTML comments, then cap the index
// at 200 lines / 25 000 chars with an explicit truncation warning so the
// model knows the index is partial and should keep entries short.

const MEMORY_INDEX_LINE_LIMIT = 200;
const MEMORY_INDEX_CHARACTER_LIMIT = 25_000;
const LEADING_FRONTMATTER_PATTERN = /^---\s*\n[\s\S]*?---\s*\n?/u;

export function formatMemoryIndexContent(content) {
  const withoutFrontmatter = content.replace(LEADING_FRONTMATTER_PATTERN, "");
  const stripped = stripTopLevelHtmlComments(withoutFrontmatter);
  return truncateMemoryIndex(stripped);
}

function truncateMemoryIndex(content) {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const lines = trimmed.split("\n");
  const lineCount = lines.length;
  const characterCount = trimmed.length;
  const lineTruncated = lineCount > MEMORY_INDEX_LINE_LIMIT;
  const characterTruncated = characterCount > MEMORY_INDEX_CHARACTER_LIMIT;
  if (!lineTruncated && !characterTruncated) return trimmed;

  let truncated = lineTruncated ? lines.slice(0, MEMORY_INDEX_LINE_LIMIT).join("\n") : trimmed;
  if (truncated.length > MEMORY_INDEX_CHARACTER_LIMIT) {
    const finalNewline = truncated.lastIndexOf("\n", MEMORY_INDEX_CHARACTER_LIMIT);
    truncated = truncated.slice(0, finalNewline > 0 ? finalNewline : MEMORY_INDEX_CHARACTER_LIMIT);
  }

  const sizeDescription =
    characterTruncated && !lineTruncated
      ? `${formatBytes(characterCount)} (limit: ${formatBytes(MEMORY_INDEX_CHARACTER_LIMIT)}) — index entries are too long`
      : lineTruncated && !characterTruncated
        ? `${lineCount} lines (limit: ${MEMORY_INDEX_LINE_LIMIT})`
        : `${lineCount} lines and ${formatBytes(characterCount)}`;

  return `${truncated}\n\n> WARNING: MEMORY.md is ${sizeDescription}. Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`;
}

function formatBytes(value) {
  const kilobytes = value / 1024;
  if (kilobytes < 1) return `${value} bytes`;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1).replace(/\.0$/u, "")}KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes.toFixed(1).replace(/\.0$/u, "")}MB`;
  return `${(megabytes / 1024).toFixed(1)}GB`;
}

// ZCode strips top-level HTML comments with a markdown lexer (marked). This
// is a conservative line-based approximation of the same contract: only
// comments that start at column 0 are removed, fenced code is never touched,
// and comments inside lists/blockquotes/paragraph text are kept as-is.
export function stripTopLevelHtmlComments(content) {
  if (!content.includes("<!--")) return content;

  const lines = content.split("\n");
  const out = [];
  let inFence = false;
  let inComment = false;
  for (const line of lines) {
    if (inComment) {
      const end = line.indexOf("-->");
      if (end >= 0) {
        inComment = false;
        const rest = line.slice(end + 3);
        if (rest.trim() !== "") out.push(rest);
      }
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence && line.startsWith("<!--")) {
      if (!line.includes("-->")) {
        inComment = true;
        continue;
      }
      const rest = line.slice(line.indexOf("-->") + 3);
      if (rest.trim() !== "") out.push(rest);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}
