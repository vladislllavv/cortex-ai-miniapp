import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </ThemeProvider>
  </StrictMode>
);
