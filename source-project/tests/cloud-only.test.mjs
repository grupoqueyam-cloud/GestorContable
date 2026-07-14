import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("no incluye almacenamiento local ni una base de datos en GitHub", () => {
  const app = readFileSync("components/editorial-app.tsx", "utf8");
  const sheets = readFileSync("lib/google-sheets.ts", "utf8");
  assert.equal(app.includes("localStorage"), false);
  assert.equal(app.includes("saveVault"), false);
  assert.equal(sheets.includes("localStorage"), false);
  assert.equal(existsSync("lib/storage.ts"), false);
  assert.equal(existsSync("public/base-inicial.enc.json"), false);
  assert.equal(existsSync("public/cloud-config.json"), true);
});
