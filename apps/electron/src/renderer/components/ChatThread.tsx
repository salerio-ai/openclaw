import { useEffect, useRef } from "react";
import type { ChatDisplayMessage, ChatDisplaySegment } from "../lib/chat-types";

type ChatThreadProps = {
  loading: boolean;
  messages: ChatDisplayMessage[];
  stream: string | null;
  liveSegments: ChatDisplaySegment[];
  running: boolean;
};

function bubbleClass(role: ChatDisplayMessage["role"]) {
  if (role === "user") {
    return "ml-auto bg-[rgba(35,134,54,0.15)] border-[rgba(35,134,54,0.6)]";
  }
  if (role === "system") {
    return "mx-auto bg-[rgba(88,166,255,0.1)]";
  }
  return "mr-auto bg-[#161b22] border-[#30363d]";
}

function renderSegment(segment: ChatDisplaySegment, key: string) {
  if (segment.type === "text") {
    return (
      <div key={key} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#c9d1d9]">
        {segment.text}
      </div>
    );
  }

  if (segment.type === "thinking") {
    return (
      <div
        key={key}
        className="whitespace-pre-wrap break-words rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs leading-relaxed text-[#8b949e]"
      >
        {segment.text}
      </div>
    );
  }

  const statusClass =
    segment.status === "completed"
      ? "text-[#3fb950]"
      : segment.status === "error"
        ? "text-[#f85149]"
        : "text-[#58a6ff]";

  return (
    <div key={key} className="rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs">
      <div className="flex items-center gap-2">
        <span className={`${statusClass} font-semibold`}>tool</span>
        <span className="text-[#c9d1d9]">{segment.name}</span>
        <span className={`${statusClass}`}>{segment.status}</span>
      </div>
      {segment.summary ? (
        <div className="mt-1 whitespace-pre-wrap break-words text-[#8b949e]">{segment.summary}</div>
      ) : null}
    </div>
  );
}

export default function ChatThread(props: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [props.messages, props.stream]);

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto rounded-xl border border-[#30363d] bg-[#0f141b] p-3"
    >
      {props.messages.length === 0 && !props.loading ? (
        <div className="my-auto text-center text-sm text-[#8b949e]">Start a conversation with OpenClaw.</div>
      ) : null}

      {props.messages.map((message) => (
        <div
          key={message.id}
          className={`max-w-[860px] rounded-xl border px-3 py-2 ${bubbleClass(message.role)}`}
        >
          <div className="mb-2 text-[11px] uppercase tracking-wide text-[#8b949e]">{message.role}</div>
          <div className="flex flex-col gap-2">
            {message.segments.map((segment, idx) => renderSegment(segment, `${message.id}-seg-${idx}`))}
          </div>
        </div>
      ))}

      {props.liveSegments.length > 0 ? (
        <div className="mr-auto max-w-[860px] rounded-xl border border-dashed border-[#30363d] bg-[#161b22] px-3 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-[#8b949e]">assistant</div>
          <div className="flex flex-col gap-2">
            {props.liveSegments.map((segment, idx) => renderSegment(segment, `live-seg-${idx}`))}
          </div>
        </div>
      ) : props.stream ? (
        <div className="mr-auto max-w-[860px] rounded-xl border border-dashed border-[#30363d] bg-[#161b22] px-3 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-[#8b949e]">assistant</div>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#c9d1d9]">{props.stream}</div>
        </div>
      ) : null}

      {props.running && !props.stream ? (
        <div className="mr-auto max-w-[860px] rounded-xl border border-dashed border-[#30363d] bg-[#161b22] px-3 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-[#8b949e]">assistant</div>
          <div className="inline-flex items-center gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8b949e]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8b949e] [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8b949e] [animation-delay:240ms]" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
