type ChatComposerProps = {
  draft: string;
  connected: boolean;
  running: boolean;
  sending: boolean;
  canSend: boolean;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort: () => void;
};

export default function ChatComposer(props: ChatComposerProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#30363d] bg-[#161b22] p-3">
      <textarea
        className="min-h-24 w-full resize-y rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm leading-relaxed text-[#c9d1d9] outline-none transition placeholder:text-[#8b949e] focus:border-[#58a6ff]"
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
        placeholder={props.connected ? "Message (Enter to send, Shift+Enter for new line)" : "Start gateway to begin chat"}
        disabled={!props.connected || props.running}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            props.onSend();
          }
        }}
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md bg-[#238636] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={props.onSend}
          disabled={!props.canSend}
        >
          {props.sending ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-xs font-medium text-[#c9d1d9] transition hover:bg-[#30363d] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={props.onAbort}
          disabled={!props.connected || !props.running}
        >
          Stop
        </button>
      </div>
    </div>
  );
}
