type TopMenuProps = {
  appInfo: AppInfo | null;
  gatewayStatus: GatewayStatus | null;
  chatConnected: boolean;
  chatLoading: boolean;
  bustlyUserInfo: BustlyUserInfo | null;
  bustlyLoggingOut: boolean;
  onRefresh: () => void;
  onNewChat: () => void;
  onStartGateway: () => void;
  onStopGateway: () => void;
  onBustlyLogin: () => void;
  onOpenSettings: () => void;
  onBustlyLogout: () => void;
};

function StatusPill(props: { label: string; online: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-medium text-[#c9d1d9]">
      <span
        className={`h-2 w-2 rounded-full ${props.online ? "bg-[#3fb950]" : "bg-[#f85149]"}`}
      />
      <span>{props.label}</span>
      <span className="font-mono text-[11px] text-[#8b949e]">{props.online ? "OK" : "OFF"}</span>
    </div>
  );
}

export default function TopMenu(props: TopMenuProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#238636] text-sm font-bold text-white">
            B
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-[#f0f6fc]">Bustly</p>
            <p className="text-[11px] text-[#8b949e]">Desktop Chat</p>
          </div>
        </div>

        <StatusPill label="Gateway" online={Boolean(props.gatewayStatus?.running)} />
        <StatusPill label="Chat" online={props.chatConnected} />

        {props.appInfo ? <span className="text-xs text-[#8b949e]">v{props.appInfo.version}</span> : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-xs font-medium text-[#c9d1d9] transition hover:bg-[#30363d] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={props.onRefresh}
          disabled={!props.chatConnected || props.chatLoading}
        >
          {props.chatLoading ? "Loading..." : "Refresh"}
        </button>

        <button
          type="button"
          className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-xs font-medium text-[#c9d1d9] transition hover:bg-[#30363d]"
          onClick={props.onNewChat}
        >
          New Chat
        </button>

        {props.gatewayStatus?.running ? (
          <button
            type="button"
            className="rounded-md bg-[#da3633] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#f85149]"
            onClick={props.onStopGateway}
          >
            Stop Gateway
          </button>
        ) : (
          <button
            type="button"
            className="rounded-md bg-[#238636] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#2ea043]"
            onClick={props.onStartGateway}
          >
            Start Gateway
          </button>
        )}

        {props.bustlyUserInfo ? (
          <div className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-2 py-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#30363d] text-[11px] font-semibold text-white">
              {(props.bustlyUserInfo.userEmail || "U").charAt(0).toUpperCase()}
            </span>
            <span className="max-w-44 truncate text-xs text-[#c9d1d9]">{props.bustlyUserInfo.userEmail}</span>
            <button
              type="button"
              className="rounded-md border border-[#30363d] bg-[#161b22] px-2 py-1 text-[11px] text-[#c9d1d9] transition hover:bg-[#30363d]"
              onClick={props.onOpenSettings}
            >
              Settings
            </button>
            <button
              type="button"
              className="rounded-md border border-[#30363d] bg-[#161b22] px-2 py-1 text-[11px] text-[#c9d1d9] transition hover:bg-[#30363d] disabled:opacity-50"
              onClick={props.onBustlyLogout}
              disabled={props.bustlyLoggingOut}
            >
              {props.bustlyLoggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="rounded-md bg-[#238636] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#2ea043]"
            onClick={props.onBustlyLogin}
          >
            Log in
          </button>
        )}
      </div>
    </header>
  );
}
