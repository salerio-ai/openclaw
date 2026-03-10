import { useEffect, useState, useCallback, useRef } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

// Types are defined in electron.d.ts
import BustlyLoginPage from "./components/Onboard/BustlyLoginPage";
import ProviderSetupPage from "./components/Onboard/ProviderSetupPage";
import DevPanel from "./components/DevPanel";
import ChatPage from "./components/ChatPage/index";
import ClientAppShell from "./components/ClientAppShell";
import SkillPage from "./components/SkillPage";
import { AppStateProvider, useAppState } from "./providers/AppStateProvider";
import GlobalLoading from "./components/ui/GlobalLoading";

interface LogEntry {
  id: number;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: Date;
}

function AppShell() {
  const {
    gatewayStatus,
    appInfo,
    loggedIn,
    initialized,
    checking,
    gatewayPhase,
    gatewayReady,
    error: sessionError,
    refreshAppState,
  } = useAppState();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname || "/";
  const logIdRef = useRef(0);
  const controlUiRequestedRef = useRef(false);
  const isDevPanelWindow = pathname === "/devpanel";
  const isBustlyLoginWindow = pathname === "/bustly-login";
  const isProviderSetupWindow = pathname === "/provider-setup";
  const isChatWindow = pathname === "/chat";

  const handleDeepLink = useCallback(
    (data: { url: string; route: string | null } | null) => {
      const route = data?.route;
      if (!route) {
        return;
      }
      if (route === "/") {
        void navigate("/", { replace: true });
        return;
      }
      void navigate(route, { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    setError(sessionError);
  }, [sessionError]);

  // Setup gateway log listeners
  useEffect(() => {
    if (!window.electronAPI) {return;}

    const unsubscribe = window.electronAPI.onGatewayLog((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: data.stream,
          message: data.message,
          timestamp: new Date(),
        },
      ]);
      // Keep only last 1000 logs
      setLogs((prev) => prev.slice(-1000));
    });

    const unsubscribeExit = window.electronAPI.onGatewayExit((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: "stderr",
          message: `Gateway exited: code=${data.code}, signal=${data.signal}`,
          timestamp: new Date(),
        },
      ]);
      void refreshAppState();
    });

    const unsubscribeMain = window.electronAPI.onMainLog((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: "stderr",
          message: `[main] ${data.message}`,
          timestamp: new Date(),
        },
      ]);
      setLogs((prev) => prev.slice(-1000));
    });

    return () => {
      unsubscribe();
      unsubscribeExit();
      unsubscribeMain();
    };
  }, [refreshAppState]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) {
      return;
    }
    const unsubscribe = window.electronAPI.onUpdateStatus(() => {});
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }
    void window.electronAPI.consumePendingDeepLink().then((data) => {
      handleDeepLink(data);
    });
    const unsubscribe = window.electronAPI.onDeepLink((data) => {
      handleDeepLink(data);
    });
    return () => {
      unsubscribe();
    };
  }, [handleDeepLink]);

  // Gateway control handlers
  const handleStartGateway = useCallback(async () => {
    if (!window.electronAPI) {return;}
    setError(null);
    const result = await window.electronAPI.gatewayStart();
    if (!result.success) {
      setError(result.error ?? "Failed to start gateway");
      return;
    }
    // Refresh status
  }, []);

  const handleStopGateway = useCallback(async () => {
    if (!window.electronAPI) {return;}
    setError(null);
    const result = await window.electronAPI.gatewayStop();
    if (!result.success) {
      setError(result.error ?? "Failed to stop gateway");
      return;
    }
    // Refresh status
  }, []);

  // Open Control UI in browser
  const handleOpenControlUI = useCallback(async () => {
    if (!gatewayStatus?.running) {
      setError("Gateway is not running");
      return;
    }
    setError("Control UI opens automatically in the desktop window.");
  }, [gatewayStatus]);

  // Clear logs
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const handleReOnboard = useCallback(async () => {
    if (!window.electronAPI) {return;}
    setError(null);
    const result = await window.electronAPI.openclawReset();
    if (!result.success) {
      setError(result.error ?? "Failed to reset onboarding");
      return;
    }
    void navigate("/bustly-login", { replace: true });
  }, []);

  const renderDefault = () => {
    if (checking) {
      return <GlobalLoading />;
    }
    if (!loggedIn) {
      return <Navigate to="/bustly-login" replace />;
    }
    return <Navigate to="/chat" replace />;
  };

  const showGatewayLoading =
    !isDevPanelWindow &&
    loggedIn &&
    ((!initialized) || (!gatewayReady && gatewayPhase !== "error"));

  return (
    <>
      <Routes>
        <Route
          path="/devpanel"
          element={
            <DevPanel
              appInfo={appInfo}
              gatewayStatus={gatewayStatus}
              logs={logs}
              error={error}
              onStartGateway={handleStartGateway}
              onStopGateway={handleStopGateway}
              onReOnboard={handleReOnboard}
              onOpenControlUI={handleOpenControlUI}
              onClearLogs={handleClearLogs}
            />
          }
        />
        <Route
          path="/bustly-login"
          element={
            <BustlyLoginPage
              onContinue={() => {
                void navigate("/", { replace: true });
              }}
              autoContinue
              showSignOut={false}
              showContinueWhenLoggedIn={false}
            />
          }
        />
        <Route
          path="/provider-setup"
          element={
            <ProviderSetupPage
              onDone={() => {
                void navigate("/", { replace: true });
              }}
            />
          }
        />
        <Route
          path="/chat"
          element={
            <ClientAppShell>
              <ChatPage />
            </ClientAppShell>
          }
        />
        <Route
          path="/skill"
          element={
            <ClientAppShell>
              <SkillPage />
            </ClientAppShell>
          }
        />
        <Route path="/" element={renderDefault()} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showGatewayLoading ? (
        <GlobalLoading />
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppStateProvider>
        <AppShell />
      </AppStateProvider>
    </HashRouter>
  );
}
