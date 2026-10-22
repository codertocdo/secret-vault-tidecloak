// Vault API client and TideCloak crypto helpers.
//
// The server is treated as untrusted: it only ever receives ciphertext.
// Titles and bodies are encrypted together, so even item names never leave the
// browser in plaintext.

export const CATEGORIES = [
  {
    id: "notes",
    tag: "notes",
    label: "Personal notes",
    hint: "Private thoughts, journals, anything you would not want leaked.",
  },
  {
    id: "recovery",
    tag: "recovery",
    label: "Recovery codes",
    hint: "2FA backup codes, seed phrases, account recovery keys.",
  },
  {
    id: "sensitive",
    tag: "sensitive",
    label: "Sensitive info",
    hint: "ID and passport numbers, bank details, medical or legal information.",
  },
];

export const MAX_BODY_LENGTH = 20000;

export const encryptRole = (tag) => `_tide_${tag}.selfencrypt`;
export const decryptRole = (tag) => `_tide_${tag}.selfdecrypt`;

async function request(apiFetch, path, init = {}) {
  const response = await apiFetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error ?? `Server responded ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

export const listItems = (apiFetch) => request(apiFetch, "/items");

export const createItem = (apiFetch, item) =>
  request(apiFetch, "/items", { method: "POST", body: JSON.stringify(item) });

export const deleteItem = (apiFetch, id) => request(apiFetch, `/items/${encodeURIComponent(id)}`, { method: "DELETE" });

export function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

// doEncrypt may return a string or a Uint8Array; normalise to something JSON-safe.
function serialise(ciphertext) {
  if (typeof ciphertext === "string") return { format: "string", value: ciphertext };
  return { format: "bytes", value: bytesToBase64(ciphertext) };
}

function deserialise({ format, value }) {
  if (format === "string") return value;
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function encryptItem(doEncrypt, category, { title, body }) {
  const [ciphertext] = await doEncrypt([
    { data: JSON.stringify({ title, body }), tags: [category.tag] },
  ]);
  return { category: category.id, ciphertext: serialise(ciphertext) };
}

export async function decryptItem(doDecrypt, category, item) {
  const [plaintext] = await doDecrypt([
    { encrypted: deserialise(item.ciphertext), tags: [category.tag] },
  ]);
  const text = typeof plaintext === "string" ? plaintext : new TextDecoder().decode(plaintext);
  return JSON.parse(text);
}
