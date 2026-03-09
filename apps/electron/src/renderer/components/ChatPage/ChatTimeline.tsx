import React, { memo, useEffect, useState } from "react";
import type { TimelineNode } from "./types";
import { toSanitizedMarkdownHtml } from "./utils";

type ChatTimelineProps = {
  timeline: TimelineNode[];
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatUserTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hours}:${minutes}`;
}

function formatProcessedDuration(durationMs: number | null | undefined): string {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 1000) {
    return "";
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-90")}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={cx("h-3.5 w-3.5 animate-spin", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

function ToolIcon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4",
  };

  switch (name) {
    case "fileText":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h6" />
          <path d="M9 9h1" />
        </svg>
      );
    case "edit":
    case "penLine":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "paperclip":
      return (
        <svg {...common}>
          <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.84-8.83a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.48a1.5 1.5 0 1 1-2.12-2.12l7.78-7.78" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a15 15 0 0 1 0 18" />
          <path d="M12 3a15 15 0 0 0 0 18" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m21 15-4.5-4.5L8 19" />
        </svg>
      );
    case "smartphone":
      return (
        <svg {...common}>
          <rect x="7" y="2.5" width="10" height="19" rx="2" />
          <path d="M11 18.5h2" />
        </svg>
      );
    case "loader":
      return <SpinnerIcon className="h-4 w-4" />;
    case "plug":
      return (
        <svg {...common}>
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M8 8h8v4a4 4 0 0 1-8 0Z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      );
    case "messageSquare":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.2 2.2-2.8-2.8Z" />
        </svg>
      );
    case "puzzle":
    default:
      return (
        <svg {...common}>
          <path d="M10 5.5a2.5 2.5 0 1 1 5 0V7h1.5A1.5 1.5 0 0 1 18 8.5V11h-1.5a2.5 2.5 0 1 0 0 5H18v2.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2.5 2.5 0 1 0-5 0V20H6.5A1.5 1.5 0 0 1 5 18.5V16h1.5a2.5 2.5 0 1 0 0-5H5V8.5A1.5 1.5 0 0 1 6.5 7H9V5.5Z" />
        </svg>
      );
  }
}

function markdownClassName(isErrorText: boolean) {
  return cx(
    "text-sm leading-7 text-gray-900",
    isErrorText && "text-red-600",
    "[&_a]:text-[#1A162F] [&_a]:underline [&_a]:underline-offset-2",
    "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500",
    "[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
    "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-gray-200 [&_pre]:bg-gray-50 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-6",
    "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
    "[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold",
    "[&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold",
    "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold",
    "[&_hr]:my-6 [&_hr]:border-gray-200",
    "[&_img]:my-4 [&_img]:max-h-[28rem] [&_img]:rounded-2xl [&_img]:border [&_img]:border-gray-200",
    "[&_li]:my-1",
    "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
    "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
    "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl",
    "[&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
    "[&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
    "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
  );
}

function shouldTightJoin(prev: TimelineNode | null, next: TimelineNode | null): boolean {
  if (!prev || !next) {
    return false;
  }
  return prev.kind === "text" && prev.tone === "thinking" && next.kind === "tool";
}

async function copyText(text: string, onCopyText?: (text: string) => void) {
  if (onCopyText) {
    onCopyText(text);
    return;
  }
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard write failures should not break the timeline UI.
  }
}

const TextNode = memo(function TextNode({
  node,
  onCopyText,
}: {
  node: Extract<TimelineNode, { kind: "text" }>;
  onCopyText?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, 1200);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [copied]);

  if (node.tone === "user") {
    const timeLabel = formatUserTime(node.timestamp);
    return (
      <div className="group/user flex flex-col items-end">
        <div className="max-w-[85%] rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900" dir="auto">
            {node.text}
          </div>
        </div>
        <div className="mt-1.5 flex min-h-[24px] items-center gap-2 px-1">
          <button
            type="button"
            aria-label="Copy message"
            className="rounded-md p-1 text-gray-500 opacity-0 transition hover:bg-gray-100 hover:text-gray-900 group-hover/user:opacity-100"
            onClick={async () => {
              void copyText(node.text, onCopyText);
              setCopied(true);
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {timeLabel ? <span className="text-[11px] font-medium text-gray-400">{timeLabel}</span> : null}
        </div>
      </div>
    );
  }

  const isErrorText = /^(error:|err:)/i.test(node.text.trim());
  if (node.tone === "thinking") {
    return (
      <div className={cx("relative animate-in fade-in slide-in-from-left-2 duration-500 pl-11", node.streaming && "opacity-90")}>
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-[26px] top-0 z-0 w-[2px]"
          style={{
            backgroundImage: "linear-gradient(to bottom, #E5E7EB 50%, transparent 50%)",
            backgroundSize: "2px 8px",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          className={cx(markdownClassName(isErrorText), "relative z-10 !text-gray-500")}
          dangerouslySetInnerHTML={{ __html: toSanitizedMarkdownHtml(node.text) }}
        />
      </div>
    );
  }

  return (
    <div
      className={cx(
        "animate-in fade-in slide-in-from-bottom-2 duration-500",
        node.streaming && "opacity-95",
        node.final && "pb-1",
      )}
    >
      <div
        className={markdownClassName(isErrorText)}
        dangerouslySetInnerHTML={{ __html: toSanitizedMarkdownHtml(node.text) }}
      />
    </div>
  );
});

const ToolNode = memo(function ToolNode({
  node,
  activeRunningToolKey,
}: {
  node: Extract<TimelineNode, { kind: "tool" }>;
  activeRunningToolKey: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const running = node.running && node.key === activeRunningToolKey;

  return (
    <div className="relative flex flex-col">
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[26px] top-[54px] z-0 w-[2px]"
        style={{
          backgroundImage: "linear-gradient(to bottom, #E5E7EB 50%, transparent 50%)",
          backgroundSize: "2px 8px",
          backgroundRepeat: "repeat-y",
        }}
      />

      <div className="relative z-10 flex flex-col">
        <button
          type="button"
          className="group mb-2 mt-2 flex items-center gap-3 text-left"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          <div className="relative flex-1 rounded-xl transition-colors hover:bg-white">
            <div
              className={cx(
                "absolute inset-0 rounded-xl transition-colors",
                expanded ? "bg-[#1A162F]/5" : "bg-transparent group-hover:bg-[#1A162F]/5",
              )}
            />

            <div className="relative flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-900">
                  <ToolIcon name={node.icon ?? "puzzle"} />
                </div>
                <span className="text-sm font-semibold text-gray-900">{node.label ?? node.summary}</span>
                <div className="flex h-3.5 w-3.5 items-center justify-center">
                  {running ? <SpinnerIcon className="text-gray-500" /> : null}
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-500">
                <ChevronIcon expanded={expanded} />
              </div>
            </div>
          </div>
        </button>

        <div
          className={cx(
            "ml-11 overflow-hidden transition-all duration-300 ease-in-out",
            expanded ? "mb-4 max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{node.detail}</pre>
          </div>
        </div>
      </div>
    </div>
  );
});

const ProcessedNode = memo(function ProcessedNode({
  node,
  activeRunningToolKey,
}: {
  node: Extract<TimelineNode, { kind: "processed" }>;
  activeRunningToolKey: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const duration = formatProcessedDuration(node.durationMs);
  const summary = duration ? `Processed ${duration}` : "Processed";

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left text-gray-400 transition-colors hover:text-gray-900"
        onClick={() => {
          setExpanded((value) => !value);
        }}
      >
        <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
        <span className="text-[11px] font-semibold tracking-[0.12em] text-current">{summary}</span>
        <ChevronIcon expanded={expanded} />
        <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      </button>

      <div
        className={cx(
          "overflow-hidden transition-all duration-300 ease-in-out",
          expanded ? "mt-4 mb-4 max-h-[2400px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <TimelineStack items={node.items} activeRunningToolKey={activeRunningToolKey} />
      </div>
    </div>
  );
});

const DividerNode = memo(function DividerNode({ node }: { node: Extract<TimelineNode, { kind: "divider" }> }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" data-ts={String(node.timestamp)}>
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{node.label}</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
});

function TimelineStack({
  items,
  activeRunningToolKey,
  onCopyText,
  spaced = false,
}: {
  items: TimelineNode[];
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
  spaced?: boolean;
}) {
  return (
    <div className={cx("flex flex-col", spaced && "gap-8")}>
      {items.map((node) => {
        return (
          <div key={node.key}>
            <TimelineItem
              node={node}
              activeRunningToolKey={activeRunningToolKey}
              onCopyText={onCopyText}
            />
          </div>
        );
      })}
    </div>
  );
}

const TimelineItem = memo(function TimelineItem({
  node,
  activeRunningToolKey,
  onCopyText,
}: {
  node: TimelineNode;
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
}) {
  switch (node.kind) {
    case "text":
      return <TextNode node={node} onCopyText={onCopyText} />;
    case "tool":
      return <ToolNode node={node} activeRunningToolKey={activeRunningToolKey} />;
    case "processed":
      return <ProcessedNode node={node} activeRunningToolKey={activeRunningToolKey} />;
    case "divider":
      return <DividerNode node={node} />;
    default:
      return null;
  }
});

function ThinkingLiveIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 animate-in fade-in duration-500">
      <div className="flex h-4 w-4 items-center justify-center overflow-hidden">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-gray-400/60" />
      </div>
      <span className="text-[14px] font-medium tracking-tight text-gray-500">{label}</span>
    </div>
  );
}

export const ChatTimeline = memo(function ChatTimeline({
  timeline,
  activeRunningToolKey,
  onCopyText,
}: ChatTimelineProps) {
  return (
    <TimelineStack items={timeline} activeRunningToolKey={activeRunningToolKey} onCopyText={onCopyText} spaced />
  );
});

export const ChatTimelineThinkingIndicator = memo(function ChatTimelineThinkingIndicator({
  label,
}: {
  label: string;
}) {
  return <ThinkingLiveIndicator label={label} />;
});
