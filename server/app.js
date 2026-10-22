import express from "express";

const CATEGORIES = new Set(["notes", "recovery", "sensitive"]);
const MAX_CIPHERTEXT_LENGTH = 64 * 1024;

function isValidCiphertext(ciphertext) {
  return ciphertext
    && ["string", "bytes"].includes(ciphertext.format)
    && typeof ciphertext.value === "string"
    && ciphertext.value.length > 0
    && ciphertext.value.length <= MAX_CIPHERTEXT_LENGTH;
}

export function createApp({ store, authenticate, mode }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true, mode }));

  app.use("/api/items", async (req, res, next) => {
    try {
      ({ owner: req.owner, roles: req.roles } = await authenticate(req));
      next();
    } catch (error) {
      res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
  });

  app.get("/api/items", (req, res) => {
    res.json(store.list(req.owner));
  });

  app.post("/api/items", (req, res) => {
    const { category, ciphertext } = req.body ?? {};
    if (!CATEGORIES.has(category)) return res.status(400).json({ error: "Unknown category" });
    if (!isValidCiphertext(ciphertext)) return res.status(400).json({ error: "Invalid ciphertext" });
    // Defence in depth: the Tide network already refuses to encrypt without the role,
    // but the server also refuses to file a record under a category the caller cannot encrypt.
    if (req.roles && !req.roles.includes(`_tide_${category}.selfencrypt`)) {
      return res.status(403).json({ error: `Missing role _tide_${category}.selfencrypt` });
    }
    // Only the whitelisted fields are stored; anything else in the body is dropped.
    res.status(201).json(store.create(req.owner, { category, ciphertext: { format: ciphertext.format, value: ciphertext.value } }));
  });

  app.delete("/api/items/:id", (req, res) => {
    if (!store.remove(req.owner, req.params.id)) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  });

  return app;
}
