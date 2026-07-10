"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("configurația funcției poate fi încărcată", () => {
  assert.doesNotThrow(() => require("./index.js"));
});
