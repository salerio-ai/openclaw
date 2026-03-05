import React, { memo } from "react";
import type { TimelineNode } from "./types";
import { toSanitizedMarkdownHtml } from "./utils";

type ChatTimelineProps = {
  timeline: TimelineNode[];
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
};

function formatUserTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

const TextNode = memo(function TextNode({ node }: { node: Extract<TimelineNode, { kind: "text" }> }) {
  if (node.tone === "user") {
    const timeLabel = formatUserTime(node.timestamp);
    return (
      <div className="chat-flow-item chat-flow-item--user-bubble">
        <div className="chat-flow-user-bubble has-copy">
          {/* Copy button would go here */}
          <div className="chat-flow-user-text" dir="auto">
            {node.text}
          </div>
        </div>
        {timeLabel && (
          <div className="chat-flow-user-time" aria-label="Message time">
            {timeLabel}
          </div>
        )}
      </div>
    );
  }

  const className =
    node.tone === "thinking"
      ? "chat-flow-item chat-flow-item--thinking"
      : "chat-flow-item chat-flow-item--text";
  const isErrorText = /^(error:|err:)/i.test(node.text.trim());
  const finalClass = `${className} ${node.streaming ? "is-running" : ""} ${isErrorText ? "chat-flow-item--error" : ""} ${node.final ? "chat-flow-item--final" : ""}`;

  return (
    <div
      className={finalClass}
      dangerouslySetInnerHTML={{ __html: toSanitizedMarkdownHtml(node.text) }}
    />
  );
});

const ToolNode = memo(function ToolNode({
  node,
  activeRunningToolKey,
}: {
  node: Extract<TimelineNode, { kind: "tool" }>;
  activeRunningToolKey: string | null;
}) {
  const running = node.running && node.key === activeRunningToolKey;
  return (
    <details className={`chat-flow-item chat-flow-item--tool ${running ? "is-running" : ""}`}>
      <summary>
        <span
          className={`chat-flow-tool-summary ${running ? "chat-flow-tool-summary--running" : "chat-flow-tool-summary--done"}`}
        >
          {running ? `Running ${node.summary}` : `Completed ${node.summary}`}
        </span>
        <span className="chat-flow-tool-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </summary>
      <pre className="chat-flow-tool-detail mono">{node.detail}</pre>
    </details>
  );
});

const ProcessedNode = memo(function ProcessedNode({
  node,
  activeRunningToolKey,
}: {
  node: Extract<TimelineNode, { kind: "processed" }>;
  activeRunningToolKey: string | null;
}) {
  const duration = formatProcessedDuration(node.durationMs);
  const summary = duration ? `Processed ${duration}` : "Processed";
  return (
    <details className="chat-flow-item chat-flow-item--processed">
      <summary>
        <span className="chat-flow-processed-line" aria-hidden="true" />
        <span className="chat-flow-processed-summary">{summary}</span>
        <span className="chat-flow-tool-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
        <span className="chat-flow-processed-line" aria-hidden="true" />
      </summary>
      <div className="chat-flow-processed-body">
        {node.items.map((item) => (
          <TimelineItem key={item.key} node={item} activeRunningToolKey={activeRunningToolKey} />
        ))}
      </div>
    </details>
  );
});

const DividerNode = memo(function DividerNode({ node }: { node: Extract<TimelineNode, { kind: "divider" }> }) {
  return (
    <div className="chat-divider" role="separator" data-ts={String(node.timestamp)}>
      <span className="chat-divider__line" />
      <span className="chat-divider__label">{node.label}</span>
      <span className="chat-divider__line" />
    </div>
  );
});

const TimelineItem = memo(function TimelineItem({
  node,
  activeRunningToolKey,
}: {
  node: TimelineNode;
  activeRunningToolKey: string | null;
}) {
  switch (node.kind) {
    case "text":
      return <TextNode node={node} />;
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

export const ChatTimeline = memo(function ChatTimeline({ timeline, activeRunningToolKey }: ChatTimelineProps) {
  return (
    <>
      {timeline.map((node) => (
        <TimelineItem key={node.key} node={node} activeRunningToolKey={activeRunningToolKey} />
      ))}
    </>
  );
});
