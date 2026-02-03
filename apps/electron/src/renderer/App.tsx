import { useEffect, useState, useCallback, useRef } from "react";

// Types are defined in electron.d.ts

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
        const [status, info] = await Promise.all([
          window.electronAPI.gatewayStatus(),
          window.electronAPI.getAppInfo(),
        ]);
        setGatewayStatus(status);
        setAppInfo(info);
      } catch (err) {
        console.error("Failed to load initial data:", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    loadInitialData();
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

    return () => {
      unsubscribe();
      unsubscribeExit();
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

    // Build HTTP URL with token for browser
    const baseUrl = `http://127.0.0.1:${gatewayStatus.port}`;

    // Extract token from wsUrl if available
    let url = baseUrl;
    if (gatewayStatus.wsUrl.includes('?token=')) {
      const urlObj = new URL(gatewayStatus.wsUrl.replace('ws://', 'http://'));
      url = `${baseUrl}?token=${urlObj.searchParams.get('token')}`;
    }

    console.log("Opening Control UI:", url);
    window.open(url, '_blank');
  }, [gatewayStatus]);

  // Clear logs
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1>OpenClaw Desktop</h1>
          {appInfo && (
            <span className="version">
              v{appInfo.version} (Electron {appInfo.electronVersion}, Node {appInfo.nodeVersion})
            </span>
          )}
        </div>
        <div className="header-right">
          <div className={`status-indicator ${gatewayStatus?.running ? "running" : "stopped"}`}>
            <span className="status-dot" />
            Gateway: {gatewayStatus?.running ? "Running" : "Stopped"}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        {/* Control panel */}
        <section className="control-panel">
          <div className="control-group">
            <h2>Gateway Control</h2>
            <div className="button-group">
              <button
                type="button"
                onClick={handleStartGateway}
                disabled={gatewayStatus?.running}
                className="btn btn-primary"
              >
                Start Gateway
              </button>
              <button
                type="button"
                onClick={handleStopGateway}
                disabled={!gatewayStatus?.running}
                className="btn btn-danger"
              >
                Stop Gateway
              </button>
              <button
                type="button"
                onClick={handleOpenControlUI}
                disabled={!gatewayStatus?.running}
                className="btn btn-secondary"
              >
                Open Control UI
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                className="btn btn-secondary"
              >
                Clear Logs
              </button>
            </div>

            {gatewayStatus && (
              <div className="status-details">
                <div className="status-item">
                  <strong>Status:</strong> {gatewayStatus.running ? "Running" : "Stopped"}
                </div>
                {gatewayStatus.pid && (
                  <div className="status-item">
                    <strong>PID:</strong> {gatewayStatus.pid}
                  </div>
                )}
                <div className="status-item">
                  <strong>Port:</strong> {gatewayStatus.port}
                </div>
                <div className="status-item">
                  <strong>Host:</strong> {gatewayStatus.host}
                </div>
                <div className="status-item">
                  <strong>WebSocket URL:</strong> {gatewayStatus.wsUrl}
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>

          {/* Logs panel */}
          <div className="logs-panel">
            <h2>Gateway Logs</h2>
            <div className="logs-container">
              {logs.length === 0 ? (
                <div className="logs-empty">No logs yet. Start the gateway to see logs.</div>
              ) : (
                <div className="logs-list">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`log-entry log-entry-${log.stream}`}
                    >
                      <span className="log-timestamp">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* TODO: Add more panels for gateway interaction */}
        {/* - Chat interface */}
        {/* - Channels management */}
        {/* - Config editor */}
        {/* - etc. */}
      </main>
    </div>
  );
}
