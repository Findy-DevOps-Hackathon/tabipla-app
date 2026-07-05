import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { SpotAddDraftProvider } from "./context/SpotAddDraftContext.tsx";
import { installPointerCursorFallback } from "./lib/cursor.ts";
import "./index.css";

installPointerCursorFallback();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("ルート要素 #root が見つかりません。");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <SpotAddDraftProvider>
        <App />
      </SpotAddDraftProvider>
    </BrowserRouter>
  </StrictMode>,
);
