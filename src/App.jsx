import { useEffect, useRef, useState } from "react";
import { useVaultAuth } from "./auth.jsx";
import {
  CATEGORIES, createItem, decryptItem, decryptRole, deleteItem, encryptItem, encryptRole, listItems,
} from "./vault.js";

const AUTO_LOCK_SECONDS = 30;
const CLIPBOARD_CLEAR_SECONDS = 30;

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

export default function App() {
  const tide = useVaultAuth();
  const { mode, authenticated, isInitializing, isLoading, initError, login, logout, getValueFromToken } = tide;

  useEffect(() => {
    if (location.pathname === "/auth/redirect" && !isInitializing) {
      history.replaceState(null, "", "/");
    }
  }, [isInitializing]);

  if (isInitializing) return <main className="center">Connecting to TideCloak…</main>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◆</span> Secret Vault</div>
        <div className="top-actions">
          <span className={`auth-state ${authenticated ? "on" : ""}`}>
            <i /> {authenticated ? getValueFromToken("preferred_username") || "Signed in" : "Not signed in"}
          </span>
          {authenticated
            ? <button className="button quiet" onClick={logout}>Log out</button>
            : <button className="button primary" onClick={login} disabled={isLoading}>
                {mode === "demo" ? "Log in (demo)" : "Log in with TideCloak"}
              </button>}
        </div>
      </header>

      {mode === "demo" && (
        <div className="notice demo" role="note">
          <span>
            <b>DEMO MODE.</b> No TideCloak adapter config was found, so login, roles and encryption are
            simulated locally with WebCrypto. Add <code>public/tidecloak.json</code> to run on real TideCloak.
          </span>
        </div>
      )}

      {initError && (
        <div className="notice error" role="alert">
          TideCloak initialization failed: {initError.message}. Check that TideCloak is running at
          localhost:8080 and that <code>public/tidecloak.json</code> is present.
        </div>
      )}

      {authenticated ? <Vault tide={tide} /> : <Landing />}

      <footer>Secret Vault · Encrypted with TideCloak · Demo data only</footer>
    </div>
  );
}

function Landing() {
  return (
    <section className="hero">
      <h1>Secrets nobody else can open.<br />Not even us.</h1>
      <p>
        Notes and recovery codes are encrypted in your browser by TideCloak before they are stored.
        They decrypt only while your session holds the right permission.
      </p>
    </section>
  );
}

function Vault({ tide }) {
  const { doEncrypt, doDecrypt, hasRealmRole, apiFetch } = tide;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [showStorage, setShowStorage] = useState(false);
  const [notice, setNotice] = useState(null);

  const category = CATEGORIES.find((item) => item.id === activeCategory);
  const canEncrypt = hasRealmRole(encryptRole(category.tag));
  const canDecrypt = hasRealmRole(decryptRole(category.tag));
  const visibleItems = items.filter((item) => item.category === category.id);

  useEffect(() => {
    listItems(apiFetch)
      .then(setItems)
      .catch((error) => setNotice({ type: "error", text: `Could not load the vault: ${errorMessage(error)}` }))
      .finally(() => setLoading(false));
    // Load once per mounted vault; apiFetch identity changes on every token refresh.
  }, []);

  async function addItem(draft) {
    let encrypted;
    try {
      encrypted = await encryptItem(doEncrypt, category, draft);
    } catch (error) {
      setNotice({ type: "error", text: `Encryption refused: ${errorMessage(error)}` });
      return false;
    }
    try {
      const stored = await createItem(apiFetch, encrypted);
      setItems((current) => [stored, ...current]);
      setNotice({ type: "ok", text: "Encrypted in your browser and stored on the server. The server only received ciphertext." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: `Could not save: ${errorMessage(error)}` });
      return false;
    }
  }

  async function removeItem(id) {
    try {
      await deleteItem(apiFetch, id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setNotice({ type: "error", text: `Could not delete: ${errorMessage(error)}` });
    }
  }

  return (
    <main className="vault">
      <nav className="tabs">
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            className={`tab ${item.id === activeCategory ? "active" : ""}`}
            onClick={() => setActiveCategory(item.id)}
          >
            {item.label}
            <span className="count">{items.filter((entry) => entry.category === item.id).length}</span>
          </button>
        ))}
        <button className={`tab inspector ${showStorage ? "active" : ""}`} onClick={() => setShowStorage(!showStorage)}>
          What storage sees
        </button>
      </nav>

      <div className="permissions">
        <Permission label="Encrypt" role={encryptRole(category.tag)} granted={canEncrypt} />
        <Permission label="Decrypt" role={decryptRole(category.tag)} granted={canDecrypt} />
      </div>

      {notice && (
        <div className={`notice ${notice.type}`} role="status">
          {notice.text}
          <button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {tide.mode === "demo" && <DemoRolePanel roles={tide.demoRoles} onToggle={tide.toggleDemoRole} />}

      {showStorage && <StorageInspector items={items} />}

      <p className="hint">{category.hint}</p>
      <NewItemForm key={category.id} category={category} disabled={!canEncrypt} onSubmit={addItem} />

      <div className="items">
        {visibleItems.map((item) => (
          <VaultItem
            key={item.id}
            item={item}
            category={category}
            canDecrypt={canDecrypt}
            doDecrypt={doDecrypt}
            onRemove={() => removeItem(item.id)}
          />
        ))}
        {loading && <p className="empty">Loading encrypted records…</p>}
        {!loading && visibleItems.length === 0 && (
          <p className="empty">Nothing stored here yet. Save one above, then use Unlock to read it back.</p>
        )}
      </div>
    </main>
  );
}

function Permission({ label, role, granted }) {
  return (
    <span className={`permission ${granted ? "granted" : "denied"}`} title={role}>
      {granted ? "✓" : "✕"} {label} <code>{role}</code>
    </span>
  );
}

function NewItemForm({ category, disabled, onSubmit }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const saved = await onSubmit({ title: title.trim(), body });
    setBusy(false);
    if (saved) {
      setTitle("");
      setBody("");
    }
  }

  return (
    <form className="new-item" onSubmit={submit}>
      <input
        placeholder={category.id === "recovery" ? "e.g. GitHub backup codes" : "Title"}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={disabled || busy}
      />
      <textarea
        placeholder={category.id === "recovery" ? "One code per line" : "Write your secret…"}
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={disabled || busy}
      />
      <div className="form-footer">
        <span className="muted">
          {disabled ? "Your session lacks the encrypt permission for this category." : "Encrypted before it is saved."}
        </span>
        <button className="button primary" type="submit" disabled={disabled || busy}>
          {busy ? "Encrypting…" : "Encrypt & save"}
        </button>
      </div>
    </form>
  );
}

function VaultItem({ item, category, canDecrypt, doDecrypt, onRemove }) {
  const [plain, setPlain] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  useEffect(() => {
    if (plain && secondsLeft === 0) lock();
  }, [plain, secondsLeft]);

  // Re-seal immediately when the user switches tab or minimises the window.
  useEffect(() => {
    const onVisibilityChange = () => { if (document.hidden) lock(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(plain.body);
    setCopied(true);
    const copiedText = plain.body;
    setTimeout(async () => {
      setCopied(false);
      try {
        // Only wipe the clipboard if it still holds our secret.
        if ((await navigator.clipboard.readText()) === copiedText) await navigator.clipboard.writeText("");
      } catch {
        await navigator.clipboard.writeText("").catch(() => {});
      }
    }, CLIPBOARD_CLEAR_SECONDS * 1000);
  }

  function remove() {
    if (window.confirm("Delete this item permanently? The ciphertext will be erased and cannot be recovered.")) {
      onRemove();
    }
  }

  function lock() {
    clearInterval(timer.current);
    setPlain(null);
    setSecondsLeft(0);
  }

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const decrypted = await decryptItem(doDecrypt, category, item);
      clearInterval(timer.current);
      setPlain(decrypted);
      setSecondsLeft(AUTO_LOCK_SECONDS);
      timer.current = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    } catch (decryptError) {
      setError(`Decryption refused by TideCloak: ${errorMessage(decryptError)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`item ${plain ? "open" : ""}`}>
      <div className="item-head">
        <div>
          <strong>{plain ? plain.title : "Locked item"}</strong>
          <small>{new Date(item.createdAt).toLocaleString()}</small>
        </div>
        <div className="item-actions">
          {plain
            ? <>
                <span className="countdown">Re-locks in {secondsLeft}s</span>
                <button className="button quiet" onClick={copy}
                  title={`Clipboard is cleared after ${CLIPBOARD_CLEAR_SECONDS}s`}>
                  {copied ? `Copied · clears in ${CLIPBOARD_CLEAR_SECONDS}s` : "Copy"}
                </button>
                <button className="button quiet" onClick={lock}>Lock</button>
              </>
            : <button className={`button ${canDecrypt ? "primary" : "quiet"}`} onClick={unlock} disabled={busy}
                title={canDecrypt ? "" : "Your session lacks the decrypt permission; the attempt will be refused"}>
                {busy ? "Decrypting…" : canDecrypt ? "Unlock" : "Try to unlock (no permission)"}
              </button>}
          <button className="button text" onClick={remove}>Delete</button>
        </div>
      </div>
      {plain
        ? <pre className="plaintext">{plain.body}</pre>
        : <code className="ciphertext">{item.ciphertext.value.slice(0, 120)}…</code>}
      {error && <p className="item-error">{error}</p>}
    </article>
  );
}

function DemoRolePanel({ roles, onToggle }) {
  return (
    <details className="demo-roles">
      <summary>Simulated admin console: grant or revoke realm roles</summary>
      <div className="demo-role-groups">
        {CATEGORIES.map((category) => (
          <div className="demo-role-group" key={category.id}>
            <strong>{category.label}</strong>
            {[["Can encrypt (save)", encryptRole(category.tag)], ["Can decrypt (read)", decryptRole(category.tag)]].map(([label, role]) => (
              <label key={role}>
                <input type="checkbox" checked={roles.includes(role)} onChange={() => onToggle(role)} />
                <span>{label}</span>
                <code>{role}</code>
              </label>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function StorageInspector({ items }) {
  return (
    <section className="inspector-panel">
      <div className="inspector-head">
        <strong>Raw records on the server</strong>
        <span className="muted">
          Exactly what the API stores in <code>server/data/vault.json</code>: what a database admin or attacker would see.
          No titles, no plaintext.
        </span>
      </div>
      <pre>{JSON.stringify(items, null, 2)}</pre>
      <small className="muted">{items.length} encrypted record(s)</small>
    </section>
  );
}
