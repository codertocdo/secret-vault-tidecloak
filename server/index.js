import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { createStore } from "./store.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const adapterPath = `${root}public/tidecloak.json`;
const adapterConfig = existsSync(adapterPath) ? JSON.parse(readFileSync(adapterPath, "utf8")) : null;
const mode = adapterConfig ? "tide" : "demo";
const port = Number(process.env.PORT ?? 3001);

const app = createApp({
  store: createStore(process.env.DATA_FILE ?? `${root}server/data/vault.json`),
  authenticate: createAuthenticator(adapterConfig),
  mode,
});

app.listen(port, "localhost", () => {
  console.log(`Secret Vault API listening on http://localhost:${port} (${mode} mode)`);
});
