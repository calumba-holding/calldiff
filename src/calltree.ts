import type { FunctionIndex } from "./extract.js";
import type { CallNode, CallStep } from "./types.js";

function displayCallLabel(key: string, index: FunctionIndex): string {
  const info = index.get(key);
  if (info) return info.label;
  return key.includes("(") ? key : `${key}()`;
}

function expandSteps(
  steps: CallStep[],
  index: FunctionIndex,
  depth: number,
  maxDepth: number,
  visiting: Set<string>,
): CallNode[] {
  return steps.map((step) => {
    if (step.type === "branch") {
      return {
        key: step.key,
        label: step.label,
        children: expandSteps(
          step.children,
          index,
          depth,
          maxDepth,
          visiting,
        ),
      };
    }
    return expandCall(step.key, index, depth, maxDepth, visiting);
  });
}

function expandCall(
  key: string,
  index: FunctionIndex,
  depth: number,
  maxDepth: number,
  visiting: Set<string>,
): CallNode {
  const label = displayCallLabel(key, index);

  if (depth >= maxDepth) {
    return { key, label, children: [] };
  }

  const info = index.get(key);
  if (!info) {
    return { key, label, children: [] };
  }

  if (visiting.has(key)) {
    return { key, label: `${label} ⇄`, children: [] };
  }

  visiting.add(key);
  const children = expandSteps(
    info.steps,
    index,
    depth + 1,
    maxDepth,
    visiting,
  );
  visiting.delete(key);

  return { key, label, children };
}

/**
 * Expand a function into a nested call tree by following known definitions.
 */
export function buildCallTree(
  entryKey: string,
  index: FunctionIndex,
  maxDepth: number,
): CallNode {
  const resolved = resolveEntry(entryKey, index) ?? entryKey;
  return expandCall(resolved, index, 0, maxDepth, new Set());
}

export function resolveEntry(
  entry: string,
  index: FunctionIndex,
): string | null {
  if (index.has(entry)) return entry;

  const stripped = entry.replace(/\(\)$/, "");
  if (index.has(stripped)) return stripped;

  const matches = [...index.keys()].filter(
    (key) =>
      key === entry ||
      key.endsWith(`.${entry}`) ||
      key === `new ${entry}`,
  );

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    const exported = matches.filter((key) => index.get(key)?.exported);
    if (exported.length === 1) return exported[0]!;
    return matches.sort()[0]!;
  }

  return null;
}
