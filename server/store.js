// Ciphertext-only record store backed by a JSON file.
//
// The server never sees plaintext: it stores exactly what the browser sends after
// TideCloak has encrypted it, plus the owner id and timestamps it assigns itself.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createStore(dataFile) {
  mkdirSync(dirname(dataFile), { recursive: true });
  let records = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : [];

  function flush() {
    // Write-then-rename so a crash never leaves a half-written file.
    const temp = `${dataFile}.tmp`;
    writeFileSync(temp, JSON.stringify(records, null, 2));
    renameSync(temp, dataFile);
  }

  return {
    list(owner) {
      return records.filter((record) => record.owner === owner);
    },
    create(owner, { category, ciphertext }) {
      const record = { id: randomUUID(), owner, category, createdAt: new Date().toISOString(), ciphertext };
      records = [record, ...records];
      flush();
      return record;
    },
    remove(owner, id) {
      const before = records.length;
      records = records.filter((record) => !(record.id === id && record.owner === owner));
      if (records.length === before) return false;
      flush();
      return true;
    },
  };
}
