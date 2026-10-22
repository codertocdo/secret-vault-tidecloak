import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "./app.js";
import { DEMO_USER_ID, createAuthenticator } from "./auth.js";
import { createStore } from "./store.js";

const dataFile = join(mkdtempSync(join(tmpdir(), "secret-vault-")), "vault.json");
const auth = { authorization: `Demo ${DEMO_USER_ID}`, "content-type": "application/json" };
let server;
let base;

before(async () => {
  const app = createApp({ store: createStore(dataFile), authenticate: createAuthenticator(null), mode: "demo" });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

const post = (body, headers = auth) => fetch(`${base}/items`, { method: "POST", headers, body: JSON.stringify(body) });

test("rejects requests without credentials", async () => {
  assert.equal((await fetch(`${base}/items`)).status, 401);
});

test("stores ciphertext only and drops any extra fields", async () => {
  const response = await post({
    category: "recovery",
    ciphertext: { format: "string", value: "demo:aXY=:c2VhbGVk" },
    title: "GitHub backup codes",
    body: "1111-2222",
  });
  assert.equal(response.status, 201);

  const onDisk = readFileSync(dataFile, "utf8");
  assert.ok(onDisk.includes("demo:aXY=:c2VhbGVk"));
  assert.ok(!onDisk.includes("GitHub backup codes"), "plaintext title must never reach disk");
  assert.ok(!onDisk.includes("1111-2222"), "plaintext body must never reach disk");
});

test("refuses to store under a category the caller cannot encrypt", async () => {
  const app = createApp({
    store: createStore(join(mkdtempSync(join(tmpdir(), "secret-vault-")), "vault.json")),
    authenticate: async () => ({ owner: "user-1", roles: ["_tide_notes.selfencrypt"] }),
    mode: "tide",
  });
  const roleServer = app.listen(0);
  await new Promise((resolve) => roleServer.once("listening", resolve));
  const url = `http://localhost:${roleServer.address().port}/api/items`;
  const send = (category) => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category, ciphertext: { format: "string", value: "x" } }),
  });
  try {
    assert.equal((await send("notes")).status, 201);
    assert.equal((await send("recovery")).status, 403);
  } finally {
    roleServer.close();
  }
});

test("validates category and ciphertext shape", async () => {
  assert.equal((await post({ category: "passwords", ciphertext: { format: "string", value: "x" } })).status, 400);
  assert.equal((await post({ category: "notes", ciphertext: "plain text" })).status, 400);
});

test("lists and deletes only the caller's records", async () => {
  const created = await (await post({ category: "notes", ciphertext: { format: "string", value: "demo:a:b" } })).json();
  const listed = await (await fetch(`${base}/items`, { headers: auth })).json();
  assert.ok(listed.some((record) => record.id === created.id));
  assert.ok(listed.every((record) => record.owner === DEMO_USER_ID));

  assert.equal((await fetch(`${base}/items/${created.id}`, { method: "DELETE", headers: auth })).status, 204);
  assert.equal((await fetch(`${base}/items/${created.id}`, { method: "DELETE", headers: auth })).status, 404);
});
