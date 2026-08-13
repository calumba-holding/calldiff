import { test } from "./expectCallstack.js";

test("kotlin: refactors calls into a helper with if/else", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      fun createAgentSession(options: Options) {
    -   AuthStorage.create()
    -   createCodingTools()
    +   val services = getServices()
    +   services.boot()
        if (options.sessionId == null) {
          SessionManager.create()
        } else {
          SessionManager.open(options.sessionId)
        }
      }

    + fun getServices(): Services {
    +   AuthStorage.create()
    +   createCodingTools()
    +   return Services()
    + }

      fun createCodingTools() {}

      class SessionManager {
        companion object {
          fun create() {}
          fun open(id: String) {}
        }
      }

      class AuthStorage {
        companion object {
          fun create() {}
        }
      }

    + class Services {
    +   fun boot() {}
    + }
    `,
    "createAgentSession",
    { file: "pi.kt" },
  ).toEqual(`
      createAgentSession(options)
    - ├─ AuthStorage.create()
    - ├─ createCodingTools()
    + ├─ getServices()
    + │  ├─ AuthStorage.create()
    + │  ├─ createCodingTools()
    + │  └─ new Services()
    + ├─ services.boot()
      ├─ if options.sessionId == null
         └─ SessionManager.create()
      └─ else
         └─ SessionManager.open(id)
  `);
});

test("kotlin: this.method resolves to Class.method", ({ expectCallstack }) => {
  expectCallstack(
    `
      class Runner {
        fun start() {
          this.prepare()
    +     this.validate()
          this.run()
        }

        fun prepare() {}
    +   fun validate() {}
        fun run() {}
      }
    `,
    "Runner.start",
    { file: "runner.kt" },
  ).toEqual(`
      Runner.start()
      ├─ Runner.prepare()
    + ├─ Runner.validate()
      └─ Runner.run()
  `);
});

test("kotlin: Thing() expands through init block", ({ expectCallstack }) => {
  expectCallstack(
    `
      fun make() {
        Thing()
      }
      class Thing {
        init {
          setup()
    +     ready()
        }
      }
      fun setup() {}
    + fun ready() {}
    `,
    "make",
    { file: "ctor.kt" },
  ).toEqual(`
      make()
      └─ Thing()
         ├─ setup()
    +    └─ ready()
  `);
});

test("kotlin: skips nested functions and lambdas", ({ expectCallstack }) => {
  expectCallstack(
    `
      fun outer() {
        fun nested() { hidden() }
        val f = { alsoHidden() }
        visible()
    +   alsoVisible()
      }
      fun hidden() {}
      fun alsoHidden() {}
      fun visible() {}
    + fun alsoVisible() {}
    `,
    "outer",
    { file: "nested.kt" },
  ).toEqual(`
      outer()
      ├─ visible()
    + └─ alsoVisible()
  `);
});

test("kotlin: else-if chains", ({ expectCallstack }) => {
  expectCallstack(
    `
      fun handle(status: String) {
        if (status == "a") {
          doA()
        } else if (status == "b") {
          doB()
    +     doExtra()
        } else {
          doOther()
        }
      }
      fun doA() {}
      fun doB() {}
    + fun doExtra() {}
      fun doOther() {}
    `,
    "handle",
    { file: "elif.kt" },
  ).toEqual(`
      handle(status)
      ├─ if status == "a"
         └─ doA()
      ├─ else if status == "b"
         ├─ doB()
    +    └─ doExtra()
      └─ else
         └─ doOther()
  `);
});

test("kotlin: try/catch/finally and when as branches", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      fun boot(x: Int) {
        try {
          openIt()
        } catch (e: Exception) {
          recover()
        } finally {
          closeIt()
        }
        when (x) {
          1 -> doA()
          else -> doOther()
        }
    +   flush()
      }
      fun openIt() {}
      fun recover() {}
      fun closeIt() {}
      fun doA() {}
      fun doOther() {}
    + fun flush() {}
    `,
    "boot",
    { file: "ctrl.kt" },
  ).toEqual(`
      boot(x)
      ├─ try
         └─ openIt()
      ├─ catch Exception
         └─ recover()
      ├─ finally
         └─ closeIt()
      ├─ case 1
         └─ doA()
      ├─ else
         └─ doOther()
    + └─ flush()
  `);
});

test("kotlin: companion object and object methods", ({ expectCallstack }) => {
  expectCallstack(
    `
      fun boot() {
        Helper.run()
        Thing.make()
    +   Thing.extra()
      }
      object Helper {
        fun run() {
          go()
        }
      }
      class Thing {
        companion object {
          fun make() {
            work()
          }
    +     fun extra() {
    +       more()
    +     }
        }
      }
      fun go() {}
      fun work() {}
    + fun more() {}
    `,
    "boot",
    { file: "companion.kt" },
  ).toEqual(`
      boot()
      ├─ Helper.run()
      │  └─ go()
      ├─ Thing.make()
      │  └─ work()
    + └─ Thing.extra()
    +    └─ more()
  `);
});

test("kotlin: trailing-lambda body nests under the receiving call", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
    + fun outer() {
    +   runBlocking {
    +     work()
    +   }
    + }
      fun work() {}
    `,
    "outer",
    { file: "lambda.kt" },
  ).toEqual(`
      outer()
    + └─ runBlocking()
    +    └─ work()
  `);
});

test("kotlin: nested trailing lambdas nest transitively", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
    + fun outer() {
    +   wrap {
    +     use {
    +       work()
    +     }
    +   }
    + }
      fun work() {}
    `,
    "outer",
    { file: "nested-lambda.kt" },
  ).toEqual(`
      outer()
    + └─ wrap()
    +    └─ use()
    +       └─ work()
  `);
});

test("kotlin: parenthesized lambda argument nests under the call", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
    + fun outer() {
    +   submit(3, { work() })
    + }
      fun work() {}
    `,
    "outer",
    { file: "paren-lambda.kt" },
  ).toEqual(`
      outer()
    + └─ submit()
    +    └─ work()
  `);
});

test("kotlin: call added inside an existing lambda diffs as an added child", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      fun outer() {
        runBlocking {
          work()
    +     extra()
        }
      }
      fun work() {}
    + fun extra() {}
    `,
    "outer",
    { file: "lambda-diff.kt" },
  ).toEqual(`
      outer()
      └─ runBlocking()
         ├─ work()
    +    └─ extra()
  `);
});

test("kotlin: args plus trailing lambda keeps the call and nests the body", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
    + fun outer(roots: List<String>) {
    +   store.read(roots) { row ->
    +     handle(row)
    +   }
    + }
      fun handle(row: String) {}
    `,
    "outer",
    { file: "args-lambda.kt" },
  ).toEqual(`
      outer(roots)
    + └─ store.read()
    +    └─ handle(row)
  `);
});
