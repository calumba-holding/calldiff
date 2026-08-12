import { expect, test as vitestTest } from "vitest";
import { buildIndex, extractFunctions } from "../src/extract.js";
import { test } from "./expectCallstack.js";

test("typescript: extracts a named function passed to a wrapper call", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      export default defineEventHandler(function handleCreate(event) {
    -   validateBody(event);
    +   const input = parseBody(event);
        if (!input) {
          throwBadRequest();
        } else {
          persist(input);
        }
      });

    + function parseBody(event) {
    +   readValidatedBody(event);
    +   return input;
    + }
    `,
    "handleCreate",
    { file: "api/create.post.ts" },
  ).toEqual(`
      handleCreate(event)
    - ├─ validateBody()
    + ├─ parseBody(event)
    + │  └─ readValidatedBody()
      ├─ if (!input)
         └─ throwBadRequest()
      └─ else
         └─ persist()
  `);
});

vitestTest("anonymous wrapped default exports are keyed by file path", () => {
  const source =
    "export default defineEventHandler(async (event) => { requireUserSession(event) })";

  const organization = extractFunctions(
    "apps/app/server/api/organization/index.post.ts",
    source,
  );
  const plans = extractFunctions(
    "apps/admin/server/api/billing/plans/index.post.ts",
    source,
  );

  expect(organization.map((fn) => fn.key)).toEqual([
    "apps/app/server/api/organization/index.post",
  ]);
  expect(plans.map((fn) => fn.key)).toEqual([
    "apps/admin/server/api/billing/plans/index.post",
  ]);

  // Keyed by stem alone these collide, and one handler shadows the other.
  const index = buildIndex([...organization, ...plans]);
  expect(index.size).toBe(2);
});

vitestTest("wrapper arguments keep their call steps", () => {
  const [handler] = extractFunctions(
    "apps/app/server/api/organization/index.post.ts",
    `export default defineEventHandler(async (event) => {
       requireUserSession(event)
       readValidatedBody(event)
       useDrizzle()
     })`,
  );

  expect(handler?.steps.map((step) => step.type === "call" && step.key)).toEqual(
    ["requireUserSession", "readValidatedBody", "useDrizzle"],
  );
});

vitestTest("wrapper calls in variable declarators are unwrapped", () => {
  const functions = extractFunctions(
    "server/api/orders/index.post.ts",
    `export const handler = defineEventHandler(async (event) => { charlie(event) })
     const cached = defineCachedFunction(async () => { delta() })
     export const named = defineEventHandler(function inner(event) { echo(event) })
     const plain = (input) => { golf(input) }`,
  );

  // Anonymous callbacks take the declared variable name; a named function
  // expression keeps its own, as it does for a default export.
  expect(functions.map((fn) => [fn.key, fn.exported])).toEqual([
    ["handler", true],
    ["cached", false],
    ["inner", true],
    ["plain", false],
  ]);

  const [handler] = functions;
  expect(handler?.steps.map((step) => step.type === "call" && step.key)).toEqual(
    ["charlie"],
  );
});

vitestTest("type wrappers around a callback are peeled off", () => {
  const functions = extractFunctions(
    "server/handlers.ts",
    `export const satisfied = defineEventHandler(((event) => { a(event) }) satisfies EventHandler)
     export const asserted = defineEventHandler(((event) => { b(event) }) as EventHandler)
     export const parenthesized = defineEventHandler(((event) => { c(event) }))
     export const angled = defineEventHandler(<EventHandler>((event) => { d(event) }))
     export const generated = Effect.gen((function* () { e() }) satisfies Gen)`,
  );

  expect(functions.map((fn) => fn.key)).toEqual([
    "satisfied",
    "asserted",
    "parenthesized",
    "angled",
    "generated",
  ]);
  expect(functions[0]?.steps.map((s) => s.type === "call" && s.key)).toEqual([
    "a",
  ]);
});

vitestTest("type wrappers around the wrapper call itself are peeled off", () => {
  const functions = extractFunctions(
    "server/api/orders/index.post.ts",
    `export default (defineEventHandler((event) => { chargeCard(event) })) as EventHandler`,
  );

  expect(functions.map((fn) => [fn.key, fn.exported])).toEqual([
    ["server/api/orders/index.post", true],
  ]);
});

vitestTest("a call argument holding no function does not stop the scan", () => {
  const functions = extractFunctions(
    "server/handlers.ts",
    `export const handler = createHandler(makeOptions(), async () => { chargeCard() })
     export const effectful = Layer.effect(makeTag(), Effect.gen(function* () { init() }))`,
  );

  expect(functions.map((fn) => fn.key)).toEqual(["handler", "effectful"]);
  expect(functions[0]?.steps.map((s) => s.type === "call" && s.key)).toEqual([
    "chargeCard",
  ]);
});

vitestTest("generator arguments to wrapper calls are unwrapped", () => {
  const functions = extractFunctions(
    "svc/user.ts",
    `export const getUser = Effect.gen(function* () {
       const cfg = yield* Config
       return yield* findUser(cfg.id)
     })
     export const layer = Layer.effect(Tag, Effect.gen(function* () { init() }))`,
  );

  expect(functions.map((fn) => [fn.key, fn.exported])).toEqual([
    ["getUser", true],
    ["layer", true],
  ]);
  // `yield* Config` is a bare reference, so only the real calls are steps.
  expect(functions[0]?.steps.map((s) => s.type === "call" && s.key)).toEqual([
    "findUser",
  ]);
});

test("tsx: diffs a component wrapped in React.memo", ({ expectCallstack }) => {
  expectCallstack(
    `
      export default memo(function OrderRow({ order }) {
        const total = formatCurrency(order.total);
        if (order.isPending) {
    -     return <Spinner />;
    +     return <SkeletonRow />;
        }
    +   trackImpression(order.id);
        return <Row total={total} />;
      });
    `,
    "OrderRow",
    { file: "OrderRow.tsx" },
  ).toEqual(`
      OrderRow({})
      ├─ formatCurrency()
      ├─ if (order.isPending)
    -    ├─ Spinner()
    +    └─ SkeletonRow()
    + ├─ trackImpression()
      └─ Row()
  `);
});

vitestTest("tsx: composed wrappers are unwrapped to the inner function", () => {
  const functions = extractFunctions(
    "components/Input.tsx",
    `export default memo(forwardRef(function Input(props, ref) { focusOnMount(ref) }))`,
  );

  expect(functions.map((fn) => [fn.key, fn.exported])).toEqual([
    ["Input", true],
  ]);
  expect(functions[0]?.steps.map((s) => s.type === "call" && s.key)).toEqual([
    "focusOnMount",
  ]);
});

vitestTest("tsx: a wrapper over a bare reference adds nothing", () => {
  // `memo(RowBase)` is an alias — RowBase is extracted at its own definition,
  // so there is no second function to record here.
  const functions = extractFunctions(
    "components/Row.tsx",
    `function RowBase({ item }) { renderCell(item) }
     export const Row = memo(RowBase)`,
  );

  expect(functions.map((fn) => fn.key)).toEqual(["RowBase"]);
});

vitestTest("tsx: an anonymous memo callback keys off the declared name", () => {
  const functions = extractFunctions(
    "components/OrderBadge.tsx",
    `export const OrderBadge = memo(({ status }) => {
       return <Badge tone={toneFor(status)} />
     })`,
  );

  expect(functions.map((fn) => fn.key)).toEqual(["OrderBadge"]);
});

vitestTest("an exported wrapped declarator is selectable as an entry", () => {
  const index = buildIndex(
    extractFunctions(
      "server/api/orders/index.post.ts",
      "export const handler = defineEventHandler(async (event) => { chargeCard() })",
    ),
  );

  expect(index.get("handler")?.exported).toBe(true);
});

vitestTest("wrapped helpers inside a body are extracted as local", () => {
  const functions = extractFunctions(
    "src/boot.ts",
    `export function boot() {
       const handler = defineEventHandler(async (event) => { chargeCard(event) })
       handler()
     }`,
  );

  expect(
    functions.map((fn) => [fn.key, fn.local ?? false, fn.exported]),
  ).toEqual([
    ["boot", false, true],
    ["handler", true, false],
  ]);
  expect(
    functions
      .find((fn) => fn.key === "handler")
      ?.steps.map((s) => s.type === "call" && s.key),
  ).toEqual(["chargeCard"]);
});

test("typescript: a wrapped local helper expands from the caller", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      export function boot() {
        const handler = defineEventHandler(async (event) => {
    -     chargeCard(event);
    +     refund(event);
        });
        handler();
      }
    `,
    "boot",
    { file: "boot.ts" },
  ).toEqual(`
      boot()
      ├─ defineEventHandler()
      └─ handler(event)
    -    ├─ chargeCard()
    +    └─ refund()
  `);
});
