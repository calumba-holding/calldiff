import { buildCallTree } from "../src/calltree.js";
import { diffTrees } from "../src/diff.js";
import { buildIndex, extractFunctions } from "../src/extract.js";
import { renderDiff } from "../src/render.js";

/**
 * Diff callstacks for a single entrypoint between two TypeScript snapshots.
 * Returns colorless ASCII output suitable for assertions.
 */
export function callstackDiff(
  beforeSource: string,
  afterSource: string,
  entry: string,
  maxDepth = 12,
): string {
  const before = buildIndex(extractFunctions("before.ts", beforeSource));
  const after = buildIndex(extractFunctions("after.ts", afterSource));

  const beforeTree = buildCallTree(entry, before, maxDepth);
  const afterTree = buildCallTree(entry, after, maxDepth);
  const diff = diffTrees(beforeTree, afterTree);
  return renderDiff(diff, { color: false });
}
