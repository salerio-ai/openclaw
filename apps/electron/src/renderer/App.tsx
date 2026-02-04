import { useEffect, useState, useCallback, useRef } from "react";

// Types are defined in electron.d.ts
import Onboard from "./components/Onboard";
import DevPanel from "./components/DevPanel";

interface LogEntry {
  id: number;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: Date;
}

export default function App() {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const logIdRef = useRef(0);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      if (!window.electronAPI) {
        console.warn("Electron API not available");
        setError("Electron API not available. Are you running in a browser?");
        return;
      }

      try {
        const [status, info, initialized, needsOnboard] = await Promise.all([
          window.electronAPI.gatewayStatus(),
          window.electronAPI.getAppInfo(),
          window.electronAPI.openclawIsInitialized(),
          window.electronAPI.openclawNeedsOnboard(),
        ]);
        setGatewayStatus(status);
        setAppInfo(info);
        setIsInitialized(initialized);

        // Show onboarding if needed for this launch
        if (needsOnboard || !initialized) {
          setShowOnboard(true);
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    loadInitialData();
  }, []);

  // Refresh gateway status periodically (handles auto-start and external changes)
  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await window.electronAPI.gatewayStatus();
        if (!cancelled) {
          setGatewayStatus(status);
        }
      } catch {}
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Setup gateway log listeners
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onGatewayLog((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: data.stream as "stdout" | "stderr",
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
      setGatewayStatus((prev) => (prev ? { ...prev, running: false, pid: null } : null));
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
  }, []);

  // Gateway control handlers
  const handleStartGateway = useCallback(async () => {
    if (!window.electronAPI) return;
    setError(null);
    const result = await window.electronAPI.gatewayStart();
    if (!result.success) {
      setError(result.error ?? "Failed to start gateway");
      return;
    }
    // Refresh status
    const status = await window.electronAPI.gatewayStatus();
    setGatewayStatus(status);
  }, []);

  const handleStopGateway = useCallback(async () => {
    if (!window.electronAPI) return;
    setError(null);
    const result = await window.electronAPI.gatewayStop();
    if (!result.success) {
      setError(result.error ?? "Failed to stop gateway");
      return;
    }
    // Refresh status
    const status = await window.electronAPI.gatewayStatus();
    setGatewayStatus(status);
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
    if (!window.electronAPI) return;
    setError(null);
    const result = await window.electronAPI.openclawReset();
    if (!result.success) {
      setError(result.error ?? "Failed to reset onboarding");
      return;
    }
    setIsInitialized(false);
    setShowOnboard(true);
  }, []);

  // Onboard handlers
  const handleOnboardComplete = useCallback(async () => {
    setShowOnboard(false);
    setIsInitialized(true);
    // Refresh status after onboarding
    if (window.electronAPI) {
      const status = await window.electronAPI.gatewayStatus();
      setGatewayStatus(status);
    }
  }, []);

  const handleOnboardCancel = useCallback(() => {
    setShowOnboard(false);
  }, []);

  // Show onboarding if needed
  if (showOnboard) {
    return <Onboard onComplete={handleOnboardComplete} onCancel={handleOnboardCancel} />;
  }

  return (
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
  );
}
