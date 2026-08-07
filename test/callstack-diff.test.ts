import assert from "node:assert/strict";
import { test } from "node:test";
import { callstackDiff } from "./helpers.js";
import { fixture } from "./fixture.js";

test("refactors calls into a helper, preserves if/else branch labels", () => {
  const fileDiff = fixture`
    export class PiService {
      static createAgentSession(options: { sessionId?: string }) {
  -     AuthStorage.create();
  -     new ModelRegistry();
  -     createCodingTools();
  +     const services = PiService.getServices();
  +     services.boot();
        if (!options.sessionId) {
          SessionManager.create();
        } else {
          SessionManager.open(options.sessionId);
        }
      }
  +
  +   static getServices() {
  +     SettingsManager.create();
  +     AuthStorage.create();
  +     new ModelRegistry();
  +     createCodingTools();
  +     return { boot() {} };
  +   }
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
  +
  + class SettingsManager {
  +   static create() {}
  + }

    function createCodingTools() {}
  `;

  const diff = callstackDiff(fileDiff, "PiService.createAgentSession");

  assert.equal(
    diff,
    fixture`
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
      ├─ if (!options.sessionId)
         └─ SessionManager.create()
      └─ else
         └─ SessionManager.open(_id)
    `,
  );
});

test("adds and removes free function calls", () => {
  const fileDiff = fixture`
    export function boot() {
      loadConfig();
  +   migrate();
      connect();
    }

    function loadConfig() {}
  + function migrate() {}
    function connect() {}
  `;

  assert.equal(
    callstackDiff(fileDiff, "boot"),
    fixture`
      boot()
      ├─ loadConfig()
    + ├─ migrate()
      └─ connect()
    `,
  );
});

test("shows ClassName.method labels for this.method calls", () => {
  const fileDiff = fixture`
    export class Runner {
      start() {
        this.prepare();
  +     this.validate();
        this.run();
      }
      prepare() {}
  +   validate() {}
      run() {}
    }
  `;

  assert.equal(
    callstackDiff(fileDiff, "Runner.start"),
    fixture`
      Runner.start()
      ├─ Runner.prepare()
    + ├─ Runner.validate()
      └─ Runner.run()
    `,
  );
});

test("labels else-if chains from source text", () => {
  const fileDiff = fixture`
    export function handle(status: string) {
      if (status === "a") {
        doA();
      } else if (status === "b") {
        doB();
  +     doExtra();
      } else {
        doOther();
      }
    }

    function doA() {}
    function doB() {}
  + function doExtra() {}
    function doOther() {}
  `;

  assert.equal(
    callstackDiff(fileDiff, "handle"),
    fixture`
      handle(status)
      ├─ if (status === "a")
         └─ doA()
      ├─ else if (status === "b")
         ├─ doB()
    +    └─ doExtra()
      └─ else
         └─ doOther()
    `,
  );
});

test("marks a fully removed callee subtree", () => {
  const fileDiff = fixture`
    export function main() {
  -   setup();
      work();
    }
  -
  - function setup() {
  -   initDb();
  - }
  -
  - function initDb() {}
    function work() {}
  `;

  assert.equal(
    callstackDiff(fileDiff, "main"),
    fixture`
      main()
    - ├─ setup()
    - │  └─ initDb()
      └─ work()
    `,
  );
});
