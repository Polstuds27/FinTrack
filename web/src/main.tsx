import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";
import { SyncProvider } from "./sync/SyncContext";
import { PreferencesProvider } from "./features/settings/preferences";
import { ToastProvider } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ui";
import { NetworkBanner } from "./components/layout/NetworkBanner";
import { registerServiceWorker } from "./app/pwa";

registerServiceWorker();

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PreferencesProvider>
            <SyncProvider>
              <ToastProvider>
                {/* Last line of defence: a render crash shows this instead of a
                    blank page, and keeps the rest of the shell mounted. */}
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
                <NetworkBanner />
              </ToastProvider>
            </SyncProvider>
          </PreferencesProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
