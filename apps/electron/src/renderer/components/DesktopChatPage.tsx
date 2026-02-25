import TopMenu from "./TopMenu";
import ChatThread from "./ChatThread";
import ChatComposer from "./ChatComposer";
import type { ChatDisplayMessage, ChatDisplaySegment } from "../lib/chat-types";

type DesktopChatPageProps = {
  appInfo: AppInfo | null;
  gatewayStatus: GatewayStatus | null;
  chatConnected: boolean;
  chatLoading: boolean;
  chatSending: boolean;
  chatMessages: ChatDisplayMessage[];
  chatDraft: string;
  chatStream: string | null;
  chatRunId: string | null;
  chatLiveSegments: ChatDisplaySegment[];
  canSend: boolean;
  error: string | null;
  updateMessage: string | null;
  bustlyUserInfo: BustlyUserInfo | null;
  bustlyLoggingOut: boolean;
  onRefresh: () => void;
  onNewChat: () => void;
  onStartGateway: () => void;
  onStopGateway: () => void;
  onBustlyLogin: () => void;
  onOpenSettings: () => void;
  onBustlyLogout: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort: () => void;
};

export default function DesktopChatPage(props: DesktopChatPageProps) {
  return (
    <div className="flex h-screen w-full flex-col bg-[#0d1117] text-[#c9d1d9]">
      <TopMenu
        appInfo={props.appInfo}
        gatewayStatus={props.gatewayStatus}
        chatConnected={props.chatConnected}
        chatLoading={props.chatLoading}
        bustlyUserInfo={props.bustlyUserInfo}
        bustlyLoggingOut={props.bustlyLoggingOut}
        onRefresh={props.onRefresh}
        onNewChat={props.onNewChat}
        onStartGateway={props.onStartGateway}
        onStopGateway={props.onStopGateway}
        onBustlyLogin={props.onBustlyLogin}
        onOpenSettings={props.onOpenSettings}
        onBustlyLogout={props.onBustlyLogout}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {props.updateMessage ? (
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#c9d1d9]">
            {props.updateMessage}
          </div>
        ) : null}

        {props.error ? (
          <div className="rounded-lg border border-[#f85149] bg-[rgba(248,81,73,0.1)] px-3 py-2 text-sm text-[#ffa198]">
            {props.error}
          </div>
        ) : null}

        <ChatThread
          loading={props.chatLoading}
          messages={props.chatMessages}
          stream={props.chatStream}
          liveSegments={props.chatLiveSegments}
          running={Boolean(props.chatRunId)}
        />

        <ChatComposer
          draft={props.chatDraft}
          connected={props.chatConnected}
          running={Boolean(props.chatRunId)}
          sending={props.chatSending}
          canSend={props.canSend}
          onDraftChange={props.onDraftChange}
          onSend={props.onSend}
          onAbort={props.onAbort}
        />
      </main>
    </div>
  );
}
