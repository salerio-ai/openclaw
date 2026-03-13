import { useEffect, useCallback, type ReactElement } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

// Types are defined in electron.d.ts
import BustlyLoginPage from "./components/Onboard/BustlyLoginPage";
import ChatPage from "./components/ChatPage/index";
import ClientAppShell from "./components/ClientAppShell";
import SkillPage from "./components/SkillPage";
import { AppStateProvider, useAppState } from "./providers/AppStateProvider";
import GlobalLoading from "./components/ui/GlobalLoading";

function AppShell() {
  const {
    loggedIn,
    checking,
    gatewayPhase,
    gatewayReady,
    refreshAppState,
  } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname || "/";
  const isBustlyLoginWindow = pathname === "/bustly-login";

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

  const renderLoginRoute = () => {
    if (checking) {
      return <GlobalLoading />;
    }
    if (loggedIn) {
      return <Navigate to="/chat" replace />;
    }
    return (
      <BustlyLoginPage
        onContinue={() => {
          void refreshAppState();
        }}
        autoContinue
        showSignOut={false}
        showContinueWhenLoggedIn={false}
      />
    );
  };

  const renderProtectedRoute = (element: ReactElement) => {
    if (checking) {
      return <GlobalLoading />;
    }
    if (!loggedIn) {
      return <Navigate to="/bustly-login" replace />;
    }
    return element;
  };

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
    !isBustlyLoginWindow &&
    loggedIn &&
    (
      !gatewayReady ||
      gatewayPhase === "idle" ||
      gatewayPhase === "checking" ||
      gatewayPhase === "starting"
    );
  return (
    <>
      <Routes>
        <Route
          path="/bustly-login"
          element={renderLoginRoute()}
        />
        <Route
          path="/provider-setup"
          element={<Navigate to="/chat" replace />}
        />
        <Route
          path="/devpanel"
          element={<Navigate to="/chat" replace />}
        />
        <Route
          path="/chat"
          element={renderProtectedRoute(
            <ClientAppShell>
              <ChatPage />
            </ClientAppShell>
          )}
        />
        <Route
          path="/skill"
          element={renderProtectedRoute(
            <ClientAppShell>
              <SkillPage />
            </ClientAppShell>
          )}
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
