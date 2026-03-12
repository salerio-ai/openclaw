import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type GatewayPhase = "idle" | "checking" | "starting" | "ready" | "error";

type AppStateContextValue = {
  appInfo: AppInfo | null;
  gatewayStatus: GatewayStatus | null;
  loggedIn: boolean;
  initialized: boolean;
  checking: boolean;
  gatewayPhase: GatewayPhase;
  gatewayReady: boolean;
  gatewayMessage: string | null;
  error: string | null;
  refreshAppState: () => Promise<void>;
  ensureGatewayReady: () => Promise<boolean>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

async function openGatewayProbe(wsUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("Timed out while opening gateway WebSocket"));
    }, 3_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
    };

    socket.addEventListener("open", () => {
      cleanup();
      socket.close();
      resolve();
    });

    socket.addEventListener("error", () => {
      cleanup();
      reject(new Error("Gateway WebSocket connection failed"));
    });
  });
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [gatewayPhase, setGatewayPhase] = useState<GatewayPhase>("idle");
  const [gatewayMessage, setGatewayMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ensurePromiseRef = useRef<Promise<boolean> | null>(null);

  const refreshAppState = useCallback(async () => {
    if (!window.electronAPI) {
      setChecking(false);
      setError("Electron API not available. Are you running in a browser?");
      return;
    }

    setChecking(true);
    try {
      const [status, info, nextInitialized, nextLoggedIn] = await Promise.all([
        window.electronAPI.gatewayStatus(),
        window.electronAPI.getAppInfo(),
        window.electronAPI.openclawIsInitialized(),
        window.electronAPI.bustlyIsLoggedIn(),
      ]);
      setGatewayStatus(status);
      setAppInfo(info);
      setInitialized(nextInitialized);
      setLoggedIn(nextLoggedIn);
      setError(null);
      if (!nextLoggedIn || !nextInitialized) {
        setGatewayPhase("idle");
        setGatewayMessage(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }, []);

  const ensureGatewayReady = useCallback(async () => {
    if (!window.electronAPI?.gatewayStatus || !window.electronAPI.gatewayConnectConfig) {
      setGatewayPhase("error");
      setGatewayMessage(null);
      setError("Electron gateway APIs are unavailable");
      return false;
    }
    if (ensurePromiseRef.current) {
      return ensurePromiseRef.current;
    }

    const task = (async () => {
      const deadline = Date.now() + 30_000;
      let lastError = "Gateway did not become reachable";
      let started = false;

      try {
        while (Date.now() < deadline) {
          const status = await window.electronAPI.gatewayStatus();
          setGatewayStatus(status);

          if (!status.running && !started) {
            started = true;
            setGatewayPhase("starting");
            setGatewayMessage("Starting gateway...");
            const startResult = await window.electronAPI.gatewayStart();
            if (!startResult.success) {
              lastError = startResult.error ?? "Failed to start gateway";
              break;
            }
          }

          if (status.running) {
            setGatewayPhase("checking");
            setGatewayMessage("Waiting for gateway...");
            try {
              const connectConfig = await window.electronAPI.gatewayConnectConfig();
              if (connectConfig.wsUrl) {
                await openGatewayProbe(connectConfig.wsUrl);
                setGatewayPhase("ready");
                setGatewayMessage(null);
                return true;
              }
            } catch (err) {
              lastError = err instanceof Error ? err.message : String(err);
            }
          } else {
            lastError = "Gateway is still starting";
          }

          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      setGatewayPhase("error");
      setGatewayMessage(null);
      setError(lastError);
      return false;
    })();

    ensurePromiseRef.current = task.finally(() => {
      ensurePromiseRef.current = null;
    });
    return ensurePromiseRef.current;
  }, []);

  useEffect(() => {
    void refreshAppState();
  }, [refreshAppState]);

  useEffect(() => {
    if (!window.electronAPI?.onBustlyLoginRefresh) {
      return;
    }
    const unsubscribe = window.electronAPI.onBustlyLoginRefresh(() => {
      void refreshAppState();
    });
    return () => {
      unsubscribe?.();
    };
  }, [refreshAppState]);

  useEffect(() => {
    if (!window.electronAPI?.onGatewayLifecycle) {
      return;
    }
    const unsubscribe = window.electronAPI.onGatewayLifecycle((data) => {
      if (data.phase === "starting") {
        setGatewayPhase("starting");
        setGatewayMessage(data.message ?? "Starting gateway...");
        setError(null);
        return;
      }
      if (data.phase === "stopping") {
        setGatewayPhase("starting");
        setGatewayMessage(data.message ?? "Restarting gateway...");
        setError(null);
        return;
      }
      if (data.phase === "ready") {
        setGatewayPhase("ready");
        setGatewayMessage(null);
        setError(null);
        void refreshAppState();
        return;
      }
      setGatewayPhase("error");
      setGatewayMessage(null);
      if (data.message) {
        setError(data.message);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [refreshAppState]);

  useEffect(() => {
    if (checking || !loggedIn || !initialized) {
      return;
    }
    if (gatewayPhase !== "idle") {
      return;
    }
    void ensureGatewayReady();
  }, [checking, ensureGatewayReady, gatewayPhase, initialized, loggedIn]);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await window.electronAPI.gatewayStatus();
        if (cancelled) {
          return;
        }
        setGatewayStatus(status);
        if (!loggedIn || !initialized) {
          return;
        }
        if (!status.running && gatewayPhase === "ready") {
          setGatewayPhase("idle");
          void ensureGatewayReady();
        }
      } catch {}
    };
    void tick();
    const interval = window.setInterval(tick, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ensureGatewayReady, gatewayPhase, initialized, loggedIn]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      appInfo,
      gatewayStatus,
      loggedIn,
      initialized,
      checking,
      gatewayPhase,
      gatewayReady: gatewayPhase === "ready",
      gatewayMessage,
      error,
      refreshAppState,
      ensureGatewayReady,
    }),
    [
      appInfo,
      checking,
      ensureGatewayReady,
      error,
      gatewayMessage,
      gatewayPhase,
      gatewayStatus,
      initialized,
      loggedIn,
      refreshAppState,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}
