import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { ResponseOverlayWindow } from "./pages/app/ResponseOverlayWindow";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { AuthGate } from "./components/auth/AuthGate";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else if (windowLabel === "response") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <ResponseOverlayWindow />
      </ThemeProvider>
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <AuthGate>
            <AppRoutes />
          </AuthGate>
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
