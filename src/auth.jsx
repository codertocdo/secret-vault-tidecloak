// Auth/crypto provider abstraction.
//
// "tide" mode wraps the real TideCloak SDK. "demo" mode is a clearly labelled local
// simulation of the same surface (login, realm roles, doEncrypt/doDecrypt), used only
// when no TideCloak adapter config (public/tidecloak.json) is available.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { TideCloakContextProvider, useTideCloak } from "@tidecloak/react";
import { CATEGORIES, bytesToBase64, decryptRole, encryptRole } from "./vault.js";

const VaultAuthContext = createContext(null);

export const useVaultAuth = () => useContext(VaultAuthContext);

export async function detectMode() {
  try {
    const response = await fetch("/tidecloak.json", { cache: "no-store" });
    if (!response.ok) return "demo";
    await response.json(); // Vite serves index.html for missing files, which fails to parse.
    return "tide";
  } catch {
    return "demo";
  }
}

export function VaultAuthProvider({ mode, children }) {
  if (mode === "tide") {
    return (
      <TideCloakContextProvider configUrl="/tidecloak.json">
        <TideBridge>{children}</TideBridge>
      </TideCloakContextProvider>
    );
  }
  return <DemoProvider>{children}</DemoProvider>;
}

function TideBridge({ children }) {
  const tide = useTideCloak();
  // secureFetch attaches the access token (and a DPoP proof when the client requires it).
  const value = useMemo(() => ({ ...tide, mode: "tide", apiFetch: tide.secureFetch }), [tide]);
  return <VaultAuthContext.Provider value={value}>{children}</VaultAuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

const DEMO_USER = { sub: "demo-user-0001", preferred_username: "demo.user" };
const SESSION_KEY = "secret-vault:demo-session";
// Versioned so roles saved before the "sensitive" category existed are not reused.
const ROLES_KEY = "secret-vault:demo-roles:v2";
const DEMO_ROLES = CATEGORIES.flatMap(({ tag }) => [encryptRole(tag), decryptRole(tag)]);

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

// Deterministic per-user key so ciphertext survives reloads. This is a simulation:
// in tide mode the key never exists in the browser or on any single server.
async function demoKey(userId) {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(`secret-vault-demo:${userId}`), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode(userId), iterations: 100000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
// Tags are bound as associated data, so a ciphertext cannot be decrypted under another tag.
const tagsAad = (tags) => new TextEncoder().encode([...tags].sort().join("|"));

function DemoProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(() => readJson(SESSION_KEY, false));
  const [roles, setRoles] = useState(() => readJson(ROLES_KEY, DEMO_ROLES));

  useEffect(() => localStorage.setItem(SESSION_KEY, JSON.stringify(authenticated)), [authenticated]);
  useEffect(() => localStorage.setItem(ROLES_KEY, JSON.stringify(roles)), [roles]);

  const value = useMemo(() => {
    const hasRealmRole = (role) => authenticated && roles.includes(role);

    function requireRole(tags, action) {
      const missing = tags.map((tag) => `_tide_${tag}.self${action}`).filter((role) => !hasRealmRole(role));
      if (missing.length) throw new Error(`Session is missing role ${missing.join(", ")}`);
    }

    return {
      mode: "demo",
      authenticated,
      isInitializing: false,
      isLoading: false,
      initError: null,
      login: async () => setAuthenticated(true),
      logout: async () => setAuthenticated(false),
      getValueFromToken: (key) => (authenticated ? DEMO_USER[key] : undefined),
      apiFetch: (url, init = {}) => fetch(url, {
        ...init,
        headers: { ...init.headers, authorization: `Demo ${DEMO_USER.sub}` },
      }),
      hasRealmRole,
      demoRoles: roles,
      toggleDemoRole: (role) => setRoles((current) => (
        current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
      )),
      doEncrypt: async (entries) => {
        const key = await demoKey(DEMO_USER.sub);
        return Promise.all(entries.map(async ({ data, tags }) => {
          requireRole(tags, "encrypt");
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const sealed = new Uint8Array(await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: tagsAad(tags) }, key, new TextEncoder().encode(data),
          ));
          return `demo:${bytesToBase64(iv)}:${bytesToBase64(sealed)}`;
        }));
      },
      doDecrypt: async (entries) => {
        const key = await demoKey(DEMO_USER.sub);
        return Promise.all(entries.map(async ({ encrypted, tags }) => {
          requireRole(tags, "decrypt");
          const [, iv, sealed] = String(encrypted).split(":");
          const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromBase64(iv), additionalData: tagsAad(tags) }, key, fromBase64(sealed),
          );
          return new TextDecoder().decode(plain);
        }));
      },
    };
  }, [authenticated, roles]);

  return <VaultAuthContext.Provider value={value}>{children}</VaultAuthContext.Provider>;
}
