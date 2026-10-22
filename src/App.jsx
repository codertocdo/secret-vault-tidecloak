import { useEffect } from "react";
import { useTideCloak } from "@tidecloak/react";

export default function App() {
  const { authenticated, isInitializing, initError, login, logout, getValueFromToken } = useTideCloak();

  useEffect(() => {
    if (location.pathname === "/auth/redirect" && !isInitializing) {
      history.replaceState(null, "", "/");
    }
  }, [isInitializing]);

  if (isInitializing) return <main>Connecting to TideCloak…</main>;

  return (
    <main>
      <h1>Secret Vault</h1>
      {initError && <p role="alert">TideCloak initialization failed: {initError.message}</p>}
      {authenticated
        ? <>
            <p>Signed in as {getValueFromToken("preferred_username")}</p>
            <button onClick={logout}>Log out</button>
          </>
        : <button onClick={login}>Log in with TideCloak</button>}
    </main>
  );
}
