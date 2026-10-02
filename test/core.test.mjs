import { test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultMemoryRoot,
  formatMemoryIndexContent,
  projectBucketName,
  sanitizeProjectSlug,
} from "../lib/core.js";

// All vectors below are synthetic; expected hashes are computed externally
// (sha256 over the lowercased path, independent of the implementation) so
// the checks stay honest without embedding any real filesystem paths.

test("projectBucketName: slug + externally computed sha256 fragment", () => {
  // keySource = lowercased "C:\demo\sample-project" -> "c:\demo\sample-project"
  // sha256("c:\demo\sample-project")[:16] = a5d9b04085132c0b (computed externally)
  assert.equal(
    projectBucketName("C:\\demo\\sample-project", "win32"),
    "sample-project-a5d9b04085132c0b",
  );
});

test("default workspace maps to a default-<16hex> bucket", () => {
  assert.match(projectBucketName("C:\\demo\\default", "win32"), /^default-[0-9a-f]{16}$/);
});

test("projectBucketName lowercases on win32 only", () => {
  const mixed = "D:\\demo\\Mixed-Case";
  assert.equal(projectBucketName(mixed, "win32"), projectBucketName(mixed.toLowerCase(), "win32"));
  assert.notEqual(projectBucketName(mixed, "linux"), projectBucketName(mixed.toLowerCase(), "linux"));
});

test("projectBucketName sanitizes awkward directory names", () => {
  assert.equal(sanitizeProjectSlug("My Project!"), "my-project");
  assert.equal(sanitizeProjectSlug("///"), "project");
});

test("defaultMemoryRoot lands inside ~/.zcode memories with the memory dir", () => {
  const root = defaultMemoryRoot("C:\\demo\\sample-project", {
    home: "C:\\Users\\demo",
    platform: "win32",
  });
  assert.match(root.replace(/\\/g, "/"), /\/\.zcode\/cli\/memories\/projects\/sample-project-a5d9b04085132c0b\/memory$/);
});

test("formatMemoryIndexContent trims plain content without warning", () => {
  const out = formatMemoryIndexContent("- [A](a.md) — hook\n- [B](b.md) — hook\n");
  assert.equal(out, "- [A](a.md) — hook\n- [B](b.md) — hook");
  assert.ok(!out.includes("WARNING"));
});

test("formatMemoryIndexContent strips leading frontmatter", () => {
  const out = formatMemoryIndexContent("---\ntitle: x\n---\n- [A](a.md) — hook\n");
  assert.equal(out, "- [A](a.md) — hook");
});

test("formatMemoryIndexContent strips top-level comments but keeps fenced ones", () => {
  const content = [
    "<!-- curated 2026-10-01 -->",
    "- [A](a.md) — hook",
    "```markdown",
    "<!-- not a comment token: example inside a fence -->",
    "```",
    "- [B](b.md) — hook",
  ].join("\n");
  const out = formatMemoryIndexContent(content);
  assert.ok(!out.includes("curated"));
  assert.ok(out.includes("not a comment token"));
  assert.ok(out.includes("- [A](a.md) — hook"));
  assert.ok(out.includes("- [B](b.md) — hook"));
});

test("formatMemoryIndexContent truncates past 200 lines with warning", () => {
  const lines = Array.from({ length: 205 }, (_, i) => `- [M${i}](m${i}.md) — hook`);
  const out = formatMemoryIndexContent(lines.join("\n"));
  assert.ok(out.includes("WARNING: MEMORY.md is 205 lines (limit: 200)"));
  assert.ok(out.includes("- [M199](m199.md) — hook"));
  assert.ok(!out.includes("- [M200](m200.md) — hook"));
});

test("formatMemoryIndexContent returns empty for empty index", () => {
  assert.equal(formatMemoryIndexContent(""), "");
  assert.equal(formatMemoryIndexContent("<!-- only a comment -->\n"), "");
});
