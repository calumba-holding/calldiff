import { expect, test } from "vitest";
import { inferEntries } from "../src/infer.js";
import type { FunctionIndex } from "../src/extract.js";
import type { FunctionInfo } from "../src/types.js";

function fn(
  key: string,
  calls: string[],
  exported = false,
): FunctionInfo {
  return {
    key,
    label: `${key}()`,
    file: "file.ts",
    steps: calls.map((call) => ({ type: "call", key: call })),
    exported,
    start: 0,
    end: 1,
  };
}

function index(...functions: FunctionInfo[]): FunctionIndex {
  return new Map(functions.map((fn) => [fn.key, fn]));
}

test("infers only exported ancestors of changed functions", () => {
  const before = index(
    fn("changed", ["oldCall"]),
    fn("changedRoot", ["changed"], true),
    fn("stable", ["sameCall"]),
    fn("stableRoot", ["stable"], true),
  );
  const after = index(
    fn("changed", ["newCall"]),
    fn("changedRoot", ["changed"], true),
    fn("stable", ["sameCall"]),
    fn("stableRoot", ["stable"], true),
  );

  expect(inferEntries(before, after, [], 12)).toEqual(["changedRoot"]);
});

test("falls back to changed non-exported functions", () => {
  const before = index(fn("worker", ["oldCall"]));
  const after = index(fn("worker", ["newCall"]));

  expect(inferEntries(before, after, [], 12)).toEqual(["worker"]);
});

test("retains explicit unchanged entries without a diff", () => {
  const before = index(fn("root", ["sameCall"], true));
  const after = index(fn("root", ["sameCall"], true));

  expect(inferEntries(before, after, ["root"], 12)).toEqual(["root"]);
});
