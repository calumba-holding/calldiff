import { expect, test } from "vitest";
import { extractCached } from "../src/extract.js";
import type { ExtractionCache } from "../src/extract.js";

const source = "export function run() { return work(); }\n";

test("reuses extraction for the same path and source", () => {
  const cache: ExtractionCache = new Map();

  const before = extractCached("src/file.ts", source, cache);
  const after = extractCached("src/file.ts", source, cache);

  expect(cache.size).toBe(1);
  expect(after).toEqual(before);
});

test("does not share path-dependent extraction results", () => {
  const cache: ExtractionCache = new Map();

  extractCached("src/before.ts", source, cache);
  extractCached("src/after.ts", source, cache);

  expect(cache.size).toBe(2);
});

test("does not share extraction across different languages", () => {
  const cache: ExtractionCache = new Map();

  extractCached("file.ts", source, cache);
  extractCached("file.tsx", source, cache);

  expect(cache.size).toBe(2);
});
