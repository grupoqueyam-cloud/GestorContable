import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("genera el sitio estático para GitHub Pages", () => {
  const html = readFileSync("docs/index.html", "utf8");
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\.\/assets\/index-/);
  assert.equal(existsSync("docs/cloud-config.json"), true);
  assert.equal(existsSync("docs/.nojekyll"), true);
});
