// Vault storage and TideCloak crypto helpers.
//
// The storage layer is treated as untrusted: it only ever receives ciphertext.
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
];

export const encryptRole = (tag) => `_tide_${tag}.selfencrypt`;
export const decryptRole = (tag) => `_tide_${tag}.selfdecrypt`;

const storageKey = (userId) => `secret-vault:${userId}`;

export function loadItems(userId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId))) ?? [];
  } catch {
    return [];
  }
}

export function saveItems(userId, items) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items));
}

export function rawStorage(userId) {
  return localStorage.getItem(storageKey(userId)) ?? "[]";
}

// doEncrypt may return a string or a Uint8Array; normalise to something JSON-safe.
function serialise(ciphertext) {
  if (typeof ciphertext === "string") return { format: "string", value: ciphertext };
  let binary = "";
  ciphertext.forEach((byte) => { binary += String.fromCharCode(byte); });
  return { format: "bytes", value: btoa(binary) };
}

function deserialise({ format, value }) {
  if (format === "string") return value;
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function encryptItem(doEncrypt, category, { title, body }) {
  const [ciphertext] = await doEncrypt([
    { data: JSON.stringify({ title, body }), tags: [category.tag] },
  ]);
  return {
    id: crypto.randomUUID(),
    category: category.id,
    createdAt: new Date().toISOString(),
    ciphertext: serialise(ciphertext),
  };
}

export async function decryptItem(doDecrypt, category, item) {
  const [plaintext] = await doDecrypt([
    { encrypted: deserialise(item.ciphertext), tags: [category.tag] },
  ]);
  const text = typeof plaintext === "string" ? plaintext : new TextDecoder().decode(plaintext);
  return JSON.parse(text);
}
