import { useCallback, useState, useEffect } from "react";

type DevPanelProps = {
  appInfo: AppInfo | null;
  gatewayStatus: GatewayStatus | null;
  logs: Array<{
    id: number;
    stream: "stdout" | "stderr";
    message: string;
    timestamp: Date;
  }>;
  error: string | null;
  onStartGateway: () => void;
  onStopGateway: () => void;
  onReOnboard: () => void;
  onOpenControlUI: () => void;
  onClearLogs: () => void;
};

export default function DevPanel({
  appInfo,
  gatewayStatus,
  logs,
  error,
  onStartGateway,
  onStopGateway,
  onReOnboard,
  onOpenControlUI,
  onClearLogs,
}: DevPanelProps) {
  const [bustlyUserInfo, setBustlyUserInfo] = useState<BustlyUserInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState<boolean>(false);

  const loadBustlyUserInfo = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const loggedIn = await window.electronAPI.bustlyIsLoggedIn();
      setIsLoggedIn(loggedIn);

      if (loggedIn) {
        const userInfo = await window.electronAPI.bustlyGetUserInfo();
        setBustlyUserInfo(userInfo);
      } else {
        setBustlyUserInfo(null);
      }
    } catch (err) {
      console.error("Failed to load Bustly user info:", err);
    }
  }, []);

  // Load Bustly user info on mount
  useEffect(() => {
    loadBustlyUserInfo();
  }, [loadBustlyUserInfo]);

  // Refresh login status when main window regains focus
  useEffect(() => {
    if (!window.electronAPI?.onBustlyLoginRefresh) return;
    const unsubscribe = window.electronAPI.onBustlyLoginRefresh(() => {
      void loadBustlyUserInfo();
    });
    return () => {
      unsubscribe?.();
    };
  }, [loadBustlyUserInfo]);

  const handleOpenControlUI = useCallback(() => {
    onOpenControlUI();
  }, [onOpenControlUI]);

  const handleBustlyLogin = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoadingUserInfo(true);
    try {
      const result = await window.electronAPI.bustlyLogin();
      if (result.success) {
        const loggedIn = await window.electronAPI.bustlyIsLoggedIn();
        setIsLoggedIn(loggedIn);
        if (loggedIn) {
          const userInfo = await window.electronAPI.bustlyGetUserInfo();
          setBustlyUserInfo(userInfo);
        }
      }
    } catch (err) {
      console.error("Bustly login failed:", err);
    } finally {
      setIsLoadingUserInfo(false);
    }
  }, []);

  const handleBustlyLogout = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.bustlyLogout();
      if (result.success) {
        setIsLoggedIn(false);
        setBustlyUserInfo(null);
      }
    } catch (err) {
      console.error("Bustly logout failed:", err);
    }
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

          {/* User Profile Section */}
          {isLoggedIn && bustlyUserInfo ? (
            <div className="user-profile">
              <div className="user-avatar">
                {bustlyUserInfo.userName.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <div className="user-name">{bustlyUserInfo.userName}</div>
                <div className="user-email">
                  {bustlyUserInfo.userEmail.slice(0, 3)}***{bustlyUserInfo.userEmail.split('@')[1]}
                </div>
              </div>
              <button
                type="button"
                onClick={handleBustlyLogout}
                className="btn-logout"
                title="Logout"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleBustlyLogin}
              disabled={isLoadingUserInfo}
              className="btn-login"
            >
              {isLoadingUserInfo ? "Logging in..." : "Login"}
            </button>
          )}
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
                onClick={onStartGateway}
                disabled={gatewayStatus?.running}
                className="btn btn-primary"
              >
                Start Gateway
              </button>
              <button
                type="button"
                onClick={onStopGateway}
                disabled={!gatewayStatus?.running}
                className="btn btn-danger"
              >
                Stop Gateway
              </button>
              <button
                type="button"
                onClick={onReOnboard}
                disabled={gatewayStatus?.running}
                className="btn btn-secondary"
              >
                Re-Onboard
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
                onClick={onClearLogs}
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
      </main>
    </div>
  );
}
