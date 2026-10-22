import React from "react";
import { createRoot } from "react-dom/client";
import { VaultAuthProvider, detectMode } from "./auth.jsx";
import App from "./App.jsx";
import "./style.css";

detectMode().then((mode) => {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <VaultAuthProvider mode={mode}>
        <App />
      </VaultAuthProvider>
    </React.StrictMode>,
  );
});
