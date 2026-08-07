import assert from "node:assert/strict";
import { test } from "node:test";
import outdent from "outdent";
import { callstackDiff } from "./helpers.js";

test("refactors calls into a helper, preserves if/else branch labels", () => {
  const before = outdent`
    export class PiService {
      static createAgentSession(options: { sessionId?: string }) {
        AuthStorage.create();
        new ModelRegistry();
        createCodingTools();
        if (!options.sessionId) {
          SessionManager.create();
        } else {
          SessionManager.open(options.sessionId);
        }
      }
    }

    class AuthStorage {
      static create() {}
    }

    class ModelRegistry {
      constructor() {}
    }

    class SessionManager {
      static create() {}
      static open(_id: string) {}
    }

    function createCodingTools() {}
  `;

  const after = outdent`
    export class PiService {
      static createAgentSession(options: { sessionId?: string }) {
        const services = PiService.getServices();
        services.boot();
        if (!options.sessionId) {
          SessionManager.create();
        } else {
          SessionManager.open(options.sessionId);
        }
      }

      static getServices() {
        SettingsManager.create();
        AuthStorage.create();
        new ModelRegistry();
        createCodingTools();
        return { boot() {} };
      }
    }

    class AuthStorage {
      static create() {}
    }

    class ModelRegistry {
      constructor() {}
    }

    class SessionManager {
      static create() {}
      static open(_id: string) {}
    }

    class SettingsManager {
      static create() {}
    }

    function createCodingTools() {}
  `;

  const diff = callstackDiff(before, after, "PiService.createAgentSession");

  assert.equal(
    diff,
    outdent`
      ${outdent}
        PiService.createAgentSession(options)
      - ├─ AuthStorage.create()
      - ├─ new ModelRegistry()
      - ├─ createCodingTools()
      + ├─ PiService.getServices()
      + │  ├─ SettingsManager.create()
      + │  ├─ AuthStorage.create()
      + │  ├─ new ModelRegistry()
      + │  └─ createCodingTools()
      + ├─ services.boot()
        ├─ if (!options.sessionId) {
        │  └─ SessionManager.create()
        └─ } else {
           └─ SessionManager.open(_id)
    `,
  );
});

test("adds and removes free function calls", () => {
  const before = outdent`
    export function boot() {
      loadConfig();
      connect();
    }

    function loadConfig() {}
    function connect() {}
  `;

  const after = outdent`
    export function boot() {
      loadConfig();
      migrate();
      connect();
    }

    function loadConfig() {}
    function migrate() {}
    function connect() {}
  `;

  const diff = callstackDiff(before, after, "boot");

  assert.equal(
    diff,
    outdent`
      ${outdent}
        boot()
        ├─ loadConfig()
      + ├─ migrate()
        └─ connect()
    `,
  );
});

test("shows ClassName.method labels for this.method calls", () => {
  const before = outdent`
    export class Runner {
      start() {
        this.prepare();
        this.run();
      }
      prepare() {}
      run() {}
    }
  `;

  const after = outdent`
    export class Runner {
      start() {
        this.prepare();
        this.validate();
        this.run();
      }
      prepare() {}
      validate() {}
      run() {}
    }
  `;

  const diff = callstackDiff(before, after, "Runner.start");

  assert.equal(
    diff,
    outdent`
      ${outdent}
        Runner.start()
        ├─ Runner.prepare()
      + ├─ Runner.validate()
        └─ Runner.run()
    `,
  );
});

test("labels else-if chains from source text", () => {
  const before = outdent`
    export function handle(status: string) {
      if (status === "a") {
        doA();
      } else if (status === "b") {
        doB();
      } else {
        doOther();
      }
    }

    function doA() {}
    function doB() {}
    function doOther() {}
  `;

  const after = outdent`
    export function handle(status: string) {
      if (status === "a") {
        doA();
      } else if (status === "b") {
        doB();
        doExtra();
      } else {
        doOther();
      }
    }

    function doA() {}
    function doB() {}
    function doExtra() {}
    function doOther() {}
  `;

  const diff = callstackDiff(before, after, "handle");

  assert.equal(
    diff,
    outdent`
      ${outdent}
        handle(status)
        ├─ if (status === "a") {
        │  └─ doA()
        ├─ } else if (status === "b") {
        │  ├─ doB()
      + │  └─ doExtra()
        └─ } else {
           └─ doOther()
    `,
  );
});

test("marks a fully removed callee subtree", () => {
  const before = outdent`
    export function main() {
      setup();
      work();
    }

    function setup() {
      initDb();
    }

    function initDb() {}
    function work() {}
  `;

  const after = outdent`
    export function main() {
      work();
    }

    function work() {}
  `;

  const diff = callstackDiff(before, after, "main");

  assert.equal(
    diff,
    outdent`
      ${outdent}
        main()
      - ├─ setup()
      - │  └─ initDb()
        └─ work()
    `,
  );
});
