import { useCallback } from "react";

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
  const handleOpenControlUI = useCallback(() => {
    onOpenControlUI();
  }, [onOpenControlUI]);

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
