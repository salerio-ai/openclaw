import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderCopyAsMarkdownButton } from "../chat/copy-as-markdown.ts";
import { extractTextCached, extractThinkingCached } from "../chat/message-extract.ts";
import { normalizeMessage } from "../chat/message-normalizer.ts";
import { icons } from "../icons.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { detectTextDirection } from "../text-direction.ts";
import { formatToolDetail, resolveToolDisplay } from "../tool-display.ts";
import type { SessionsListResult } from "../types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type FallbackIndicatorStatus = {
  phase?: "active" | "cleared";
  selected: string;
  active: string;
  previous?: string;
  reason?: string;
  attempts: string[];
  occurredAt: number;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  fallbackStatus?: FallbackIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  thinkingStream?: string | null;
  streamSeq?: number | null;
  thinkingStreamSeq?: number | null;
  thinkingStreamStartedAt?: number | null;
  thinkingStreamUpdatedAt?: number | null;
  streamStartedAt: number | null;
  streamUpdatedAt?: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Scroll control
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
};

type TimelineNode =
  | {
      kind: "text";
      key: string;
      timestamp: number;
      text: string;
      tone: "user" | "assistant" | "thinking" | "system";
      streaming?: boolean;
      final?: boolean;
    }
  | {
      kind: "tool";
      key: string;
      timestamp: number;
      mergeKey: string;
      summary: string;
      detail: string;
      hasOutput: boolean;
      completed: boolean;
      running?: boolean;
    }
  | {
      kind: "processed";
      key: string;
      timestamp: number;
      durationMs: number | null;
      items: TimelineNode[];
    }
  | { kind: "divider"; key: string; label: string; timestamp: number };

const COMPACTION_TOAST_DURATION_MS = 5000;
const FALLBACK_TOAST_DURATION_MS = 8000;
const STREAM_ACTIVITY_WINDOW_MS = 500;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="compaction-indicator compaction-indicator--active" role="status" aria-live="polite">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="compaction-indicator compaction-indicator--complete" role="status" aria-live="polite">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function renderFallbackIndicator(status: FallbackIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  const phase = status.phase ?? "active";
  const elapsed = Date.now() - status.occurredAt;
  if (elapsed >= FALLBACK_TOAST_DURATION_MS) {
    return nothing;
  }
  const details = [
    `Selected: ${status.selected}`,
    phase === "cleared" ? `Active: ${status.selected}` : `Active: ${status.active}`,
    phase === "cleared" && status.previous ? `Previous fallback: ${status.previous}` : null,
    status.reason ? `Reason: ${status.reason}` : null,
    status.attempts.length > 0 ? `Attempts: ${status.attempts.slice(0, 3).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const message =
    phase === "cleared"
      ? `Fallback cleared: ${status.selected}`
      : `Fallback active: ${status.active}`;
  const className =
    phase === "cleared"
      ? "compaction-indicator compaction-indicator--fallback-cleared"
      : "compaction-indicator compaction-indicator--fallback";
  const icon = phase === "cleared" ? icons.check : icons.brain;
  return html`
    <div
      class=${className}
      role="status"
      aria-live="polite"
      title=${details}
    >
      ${icon} ${message}
    </div>
  `;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
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

function formatUserBubbleTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function renderTimelineNode(item: TimelineNode, activeRunningToolKey: string | null) {
  if (item.kind === "divider") {
    return html`
      <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
        <span class="chat-divider__line"></span>
        <span class="chat-divider__label">${item.label}</span>
        <span class="chat-divider__line"></span>
      </div>
    `;
  }
  if (item.kind === "tool") {
    const running = item.running && item.key === activeRunningToolKey;
    return html`
      <details class="chat-flow-item chat-flow-item--tool ${running ? "is-running" : ""}">
        <summary>
          <span class="chat-flow-tool-summary ${running ? "chat-flow-tool-summary--running" : "chat-flow-tool-summary--done"}">
            ${running ? `Running ${item.summary}` : `Completed ${item.summary}`}
          </span>
          <span class="chat-flow-tool-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </summary>
        <pre class="chat-flow-tool-detail mono">${item.detail}</pre>
      </details>
    `;
  }
  if (item.kind === "processed") {
    const duration = formatProcessedDuration(item.durationMs);
    const summary = duration ? `Processed ${duration}` : "Processed";
    return html`
      <details class="chat-flow-item chat-flow-item--processed">
        <summary>
          <span class="chat-flow-processed-line" aria-hidden="true"></span>
          <span class="chat-flow-processed-summary">${summary}</span>
          <span class="chat-flow-tool-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
          <span class="chat-flow-processed-line" aria-hidden="true"></span>
        </summary>
        <div class="chat-flow-processed-body">
          ${repeat(
            item.items,
            (entry) => entry.key,
            (entry) => renderTimelineNode(entry, activeRunningToolKey),
          )}
        </div>
      </details>
    `;
  }
  if (item.tone === "user") {
    const timeLabel = formatUserBubbleTimestamp(item.timestamp);
    return html`
      <div class="chat-flow-item chat-flow-item--user-bubble">
        <div class="chat-flow-user-bubble has-copy">
          ${renderCopyAsMarkdownButton(item.text)}
          ${unsafeHTML(toSanitizedMarkdownHtml(item.text))}
        </div>
        ${
          timeLabel
            ? html`<div class="chat-flow-user-time" aria-label="Message time">${timeLabel}</div>`
            : nothing
        }
      </div>
    `;
  }
  const className =
    item.tone === "thinking"
      ? "chat-flow-item chat-flow-item--thinking"
      : "chat-flow-item chat-flow-item--text";
  const isErrorText = item.tone !== "user" && /^(error:|err:)/i.test(item.text.trim());
  return html`
    <div class="${className} ${item.streaming ? "is-running" : ""} ${isErrorText ? "chat-flow-item--error" : ""} ${item.final ? "chat-flow-item--final" : ""}">
      ${unsafeHTML(toSanitizedMarkdownHtml(item.text))}
    </div>
  `;
}

function collapseProcessedTurn(nodes: TimelineNode[]): TimelineNode[] {
  if (nodes.length === 0) {
    return nodes;
  }
  const finalIndices: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "text" && node.tone === "assistant" && node.final) {
      finalIndices.push(i);
    }
  }
  if (finalIndices.length === 0) {
    return nodes;
  }

  const result: TimelineNode[] = [];
  let cursor = 0;

  for (const finalIndex of finalIndices) {
    if (finalIndex < cursor) {
      continue;
    }
    const finalNode = nodes[finalIndex];
    let turnStart = cursor;
    for (let i = finalIndex - 1; i >= cursor; i--) {
      const node = nodes[i];
      if (node.kind === "text" && node.tone === "user") {
        turnStart = i + 1;
        break;
      }
    }

    // Keep non-collapsed nodes before this turn.
    if (turnStart > cursor) {
      result.push(...nodes.slice(cursor, turnStart));
    }

    const collapsedItems = nodes
      .slice(turnStart, finalIndex)
      .filter((node) => node.kind !== "divider");
    if (collapsedItems.length > 0) {
      const estimatedDurationMs =
        finalNode.timestamp >= collapsedItems[0].timestamp
          ? finalNode.timestamp - collapsedItems[0].timestamp
          : null;
      result.push({
        kind: "processed",
        key: `processed:${finalNode.key}`,
        timestamp: collapsedItems[0]?.timestamp ?? finalNode.timestamp,
        durationMs: estimatedDurationMs,
        items: collapsedItems,
      });
    } else if (finalIndex > cursor && turnStart === cursor) {
      // No collapsible content; preserve raw nodes before final.
      result.push(...nodes.slice(cursor, finalIndex));
    }

    // Final assistant message remains visible.
    result.push(finalNode);
    cursor = finalIndex + 1;
  }

  if (cursor < nodes.length) {
    result.push(...nodes.slice(cursor));
  }

  return result;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : "Message (↩ to send, Shift+↩ for line breaks, paste images)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const timeline = collapseProcessedTurn(buildTimelineNodes(props));
  const currentTurnStartedAt = props.streamStartedAt ?? null;
  const activeRunningToolKey = resolveActiveRunningToolKey(timeline, currentTurnStartedAt);
  const hasRunningTool = hasRunningToolInCurrentTurn(timeline, currentTurnStartedAt);
  const hasStreamingText = props.stream !== null && props.stream.trim().length > 0;
  const textStreamUpdatedAt = props.streamUpdatedAt ?? props.streamStartedAt;
  const hasActiveStreamingText =
    hasStreamingText &&
    typeof textStreamUpdatedAt === "number" &&
    Date.now() - textStreamUpdatedAt < STREAM_ACTIVITY_WINDOW_MS;
  const hasStreamingThinking =
    typeof props.thinkingStream === "string" && props.thinkingStream.trim().length > 0;
  const thinkingStreamUpdatedAt = props.thinkingStreamUpdatedAt ?? props.thinkingStreamStartedAt;
  const hasActiveThinkingText =
    hasStreamingThinking &&
    typeof thinkingStreamUpdatedAt === "number" &&
    Date.now() - thinkingStreamUpdatedAt < STREAM_ACTIVITY_WINDOW_MS;
  const hasInFlightTurn = Boolean(props.canAbort) || props.sending || props.streamStartedAt != null;
  const showLoading =
    hasInFlightTurn && !hasRunningTool && !hasActiveStreamingText && !hasActiveThinkingText;

  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat…</div>
            `
          : nothing
      }
      ${repeat(
        timeline,
        (item) => item.key,
        (item) => renderTimelineNode(item, activeRunningToolKey),
      )}
      ${
        showLoading
          ? html`
              <div class="chat-flow-item chat-flow-item--thinking-live">
                <p class="chat-flow-thinking-live">Thinking...</p>
              </div>
            `
          : nothing
      }
    </div>
  `;

  return html`
    <section class="card chat">
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${
        props.focusMode
          ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
          : nothing
      }

      <div
        class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
      >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${
          sidebarOpen
            ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                })}
              </div>
            `
            : nothing
        }
      </div>

      ${
        props.queue.length
          ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${
                          item.text ||
                          (item.attachments?.length ? `Image (${item.attachments.length})` : "")
                        }
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }

      ${renderFallbackIndicator(props.fallbackStatus)}
      ${renderCompactionIndicator(props.compactionStatus)}

      ${
        props.showNewMessages
          ? html`
            <button
              class="btn chat-new-messages"
              type="button"
              @click=${props.onScrollToBottom}
            >
              New messages ${icons.arrowDown}
            </button>
          `
          : nothing
      }

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              dir=${detectTextDirection(props.draft)}
              ?disabled=${!props.connected}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                  return;
                }
                if (e.isComposing || e.keyCode === 229) {
                  return;
                }
                if (e.shiftKey) {
                  return;
                } // Allow Shift+Enter for line breaks
                if (!props.connected) {
                  return;
                }
                e.preventDefault();
                if (canCompose) {
                  props.onSend();
                }
              }}
              @input=${(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                adjustTextareaHeight(target);
                props.onDraftChange(target.value);
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
          </label>
          <div class="chat-compose__actions">
            <button
              class="btn"
              ?disabled=${!props.connected || (!canAbort && props.sending)}
              @click=${canAbort ? props.onAbort : props.onNewSession}
            >
              ${canAbort ? "Stop" : "New session"}
            </button>
            <button
              class="btn primary"
              ?disabled=${!props.connected}
              @click=${props.onSend}
            >
              ${isBusy ? "Queue" : "Send"}<kbd class="btn-kbd">↵</kbd>
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function buildTimelineNodes(props: ChatProps): TimelineNode[] {
  const nodes: Array<{ node: TimelineNode; timestamp: number; seq: number | null; order: number }> =
    [];
  let order = 0;
  const pushNode = (node: TimelineNode, timestamp: number, seq: number | null = null) => {
    nodes.push({ node, timestamp, seq, order: order++ });
  };
  const upsertToolNode = (
    toolNode: Extract<TimelineNode, { kind: "tool" }>,
    timestamp: number,
    seq: number | null,
  ) => {
    const existing = nodes.find(
      (entry) => entry.node.kind === "tool" && entry.node.mergeKey === toolNode.mergeKey,
    );
    if (!existing) {
      pushNode(toolNode, timestamp, seq);
      return;
    }
    const current = existing.node as Extract<TimelineNode, { kind: "tool" }>;
    const completed = current.completed || toolNode.completed;
    const summary =
      toolNode.summary.length > current.summary.length ? toolNode.summary : current.summary;
    existing.node = {
      ...current,
      summary,
      detail: mergeToolDetails(current.detail, toolNode.detail),
      hasOutput: current.hasOutput || toolNode.hasOutput,
      completed,
      running: !completed,
      timestamp: Math.min(current.timestamp, toolNode.timestamp),
    };
    existing.timestamp = Math.min(existing.timestamp, timestamp);
    if (typeof existing.seq === "number" && typeof seq === "number") {
      existing.seq = Math.min(existing.seq, seq);
    } else if (typeof seq === "number") {
      existing.seq = seq;
    }
  };
  const seenMessageKeys = new Set<string>();
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  const fallbackBaseTs = Date.now();
  if (historyStart > 0) {
    pushNode(
      {
        kind: "text",
        key: "chat:history:notice",
        timestamp: Number.MIN_SAFE_INTEGER,
        text: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        tone: "system",
      },
      Number.MIN_SAFE_INTEGER,
    );
  }
  for (let i = historyStart; i < history.length; i++) {
    const rawEntry = history[i];
    const { message: msg, envelope } = unwrapMessageEnvelope(rawEntry);
    const normalized = normalizeMessage(msg);
    const timestamp = resolveMessageTimestamp(msg, envelope, fallbackBaseTs + i);
    const seq = resolveMessageSeq(msg, envelope);
    const marker =
      (envelope.__openclaw as Record<string, unknown> | undefined) ??
      (msg.__openclaw as Record<string, unknown> | undefined);
    if (marker && marker.kind === "compaction") {
      pushNode(
        {
          kind: "divider",
          key:
            typeof marker.id === "string"
              ? `divider:compaction:${marker.id}`
              : `divider:compaction:${timestamp}:${i}`,
          label: "Compaction",
          timestamp,
        },
        timestamp,
        seq,
      );
      continue;
    }

    // Filter out system notification messages (e.g., "Exec completed", background process updates)
    // These are internal OpenClaw events that shouldn't be shown to users
    if (normalized.role.toLowerCase() === "system") {
      const textContent = normalized.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      // Skip system messages that look like internal notifications
      if (
        /^System:\s*\[.*\]\s*Exec completed/i.test(textContent) ||
        /^\[.*\]\s*Exec completed/i.test(textContent) ||
        textContent.startsWith("Exec completed")
      ) {
        continue;
      }
    }

    const key = messageKey(rawEntry, i);
    seenMessageKeys.add(key);
    const role = normalized.role.toLowerCase();
    const stopReason = typeof msg?.stopReason === "string" ? msg.stopReason.toLowerCase() : "";
    const isFinalMessage = role === "assistant" && stopReason === "stop";
    const thinking = extractThinkingCached(msg);
    if (thinking) {
      pushNode(
        {
          kind: "text",
          key: `thinking:${key}`,
          timestamp,
          text: thinking,
          tone: "thinking",
        },
        timestamp,
        seq,
      );
    }
    const toolNodes = toToolNodes(msg, key, timestamp);
    for (const toolNode of toolNodes) {
      upsertToolNode(toolNode, timestamp, seq);
    }

    const isToolRole = (() => {
      const lower = role.toLowerCase();
      return lower === "toolresult" || lower === "tool_result" || lower === "tool";
    })();
    const text = extractTextCached(msg) ?? extractAssistantTerminalFallback(msg);
    if (!text?.trim() || isToolRole) {
      continue;
    }
    if (role === "thinking") {
      if (!thinking) {
        pushNode(
          {
            kind: "text",
            key: `thinking:${key}:fallback`,
            timestamp,
            text,
            tone: "thinking",
          },
          timestamp,
          seq,
        );
      }
      continue;
    }
    pushNode(
      {
        kind: "text",
        key: `text:${key}`,
        timestamp,
        text,
        tone: role === "user" ? "user" : role === "assistant" ? "assistant" : "system",
        final: isFinalMessage,
      },
      timestamp,
      seq,
    );
  }

  for (let i = 0; i < tools.length; i++) {
    const rawEntry = tools[i];
    const { message: msg, envelope } = unwrapMessageEnvelope(rawEntry);
    const key = messageKey(rawEntry, i + history.length);
    if (seenMessageKeys.has(key)) {
      continue;
    }
    const timestamp = resolveMessageTimestamp(msg, envelope, fallbackBaseTs + history.length + i);
    const seq = resolveMessageSeq(msg, envelope);
    const toolNodes = toToolNodes(msg, key, timestamp);
    if (toolNodes.length === 0) {
      continue;
    }
    for (const toolNode of toolNodes) {
      upsertToolNode(toolNode, timestamp, seq);
    }
  }

  if (props.stream !== null) {
    const streamTimestamp =
      props.streamUpdatedAt ??
      props.streamStartedAt ??
      fallbackBaseTs + history.length + tools.length;
    if (props.stream.trim().length > 0) {
      const normalizedStreamText = normalizeComparableText(props.stream);
      const hasRecentAssistantDuplicate = nodes.some((entry) => {
        if (entry.node.kind !== "text") {
          return false;
        }
        if (entry.node.tone !== "assistant" || entry.node.streaming) {
          return false;
        }
        if (Math.abs(entry.timestamp - streamTimestamp) > 15_000) {
          return false;
        }
        return normalizeComparableText(entry.node.text) === normalizedStreamText;
      });
      if (hasRecentAssistantDuplicate) {
        const ordered = nodes
          .toSorted((a, b) => {
            if (typeof a.seq === "number" && typeof b.seq === "number") {
              return a.seq === b.seq ? a.order - b.order : a.seq - b.seq;
            }
            if (a.timestamp === b.timestamp) {
              return a.order - b.order;
            }
            return a.timestamp - b.timestamp;
          })
          .map((entry) => entry.node);
        return dedupeAdjacentAssistantTextNodes(ordered);
      }
      const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}:text`;
      pushNode(
        {
          kind: "text",
          key,
          timestamp: streamTimestamp,
          text: props.stream,
          tone: "assistant",
          streaming: true,
        },
        streamTimestamp,
        props.streamSeq ?? null,
      );
    }
  }

  if (props.thinkingStream !== null) {
    const thinkingTimestamp =
      props.thinkingStreamUpdatedAt ??
      props.thinkingStreamStartedAt ??
      fallbackBaseTs + history.length + tools.length + 1;
    if (props.thinkingStream.trim().length > 0) {
      const key = `stream:${props.sessionKey}:${props.thinkingStreamStartedAt ?? "live"}:thinking`;
      pushNode(
        {
          kind: "text",
          key,
          timestamp: thinkingTimestamp,
          text: props.thinkingStream,
          tone: "thinking",
          streaming: true,
        },
        thinkingTimestamp,
        props.thinkingStreamSeq ?? null,
      );
    }
  }

  const ordered = nodes
    .toSorted((a, b) => {
      if (typeof a.seq === "number" && typeof b.seq === "number") {
        return a.seq === b.seq ? a.order - b.order : a.seq - b.seq;
      }
      if (a.timestamp === b.timestamp) {
        return a.order - b.order;
      }
      return a.timestamp - b.timestamp;
    })
    .map((entry) => entry.node);
  return dedupeAdjacentAssistantTextNodes(ordered);
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function dedupeAdjacentAssistantTextNodes(nodes: TimelineNode[]): TimelineNode[] {
  const out: TimelineNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === "text" &&
      node.kind === "text" &&
      prev.tone === "assistant" &&
      node.tone === "assistant" &&
      !prev.streaming &&
      !node.streaming &&
      normalizeComparableText(prev.text) === normalizeComparableText(node.text) &&
      Math.abs(prev.timestamp - node.timestamp) <= 15_000
    ) {
      // Prefer the richer terminal snapshot when both messages are equivalent.
      if (!prev.final && node.final) {
        out[out.length - 1] = node;
      }
      continue;
    }
    out.push(node);
  }
  return out;
}

function hasRunningToolInCurrentTurn(
  nodes: TimelineNode[],
  currentTurnStartedAt: number | null,
): boolean {
  if (currentTurnStartedAt == null) {
    return false;
  }
  return nodes.some(
    (node) =>
      node.kind === "tool" && node.running === true && node.timestamp >= currentTurnStartedAt,
  );
}

function resolveActiveRunningToolKey(
  nodes: TimelineNode[],
  currentTurnStartedAt: number | null,
): string | null {
  if (currentTurnStartedAt == null) {
    return null;
  }
  const running = nodes.filter(
    (node): node is Extract<TimelineNode, { kind: "tool" }> =>
      node.kind === "tool" && node.running === true && node.timestamp >= currentTurnStartedAt,
  );
  if (running.length === 0) {
    return null;
  }
  return running[running.length - 1].key;
}

function extractAssistantTerminalFallback(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
  if (role !== "assistant") {
    return null;
  }
  const stopReason = typeof m.stopReason === "string" ? m.stopReason.toLowerCase() : "";
  const rawError =
    (typeof m.errorMessage === "string" ? m.errorMessage : undefined) ??
    (typeof m.error_message === "string" ? m.error_message : undefined);
  const error = rawError?.trim();
  if (!error) {
    return null;
  }
  if (stopReason === "aborted") {
    return error;
  }
  if (!stopReason || stopReason === "error") {
    return /^(error:|err:)/i.test(error) ? error : `Error: ${error}`;
  }
  return null;
}

function toToolNodes(
  message: unknown,
  key: string,
  timestamp: number,
): Array<Extract<TimelineNode, { kind: "tool" }>> {
  const m = message as Record<string, unknown>;
  const marker =
    m.__openclaw && typeof m.__openclaw === "object"
      ? (m.__openclaw as Record<string, unknown>)
      : undefined;
  const toolPhase = typeof marker?.toolPhase === "string" ? marker.toolPhase.toLowerCase() : "";
  const content = Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : [];
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
  const messageToolCallId =
    (typeof m.toolCallId === "string" ? m.toolCallId : undefined) ??
    (typeof m.tool_call_id === "string" ? m.tool_call_id : undefined);
  const hasToolId = Boolean(messageToolCallId);
  const hasToolRole =
    role === "toolresult" || role === "tool_result" || role === "tool" || role === "function";
  const callItems = content.filter((entry) => {
    const type = (typeof entry.type === "string" ? entry.type : "").toLowerCase();
    return type === "toolcall" || type === "tool_call" || type === "tooluse" || type === "tool_use";
  });
  const resultItems = content.filter((entry) => {
    const type = (typeof entry.type === "string" ? entry.type : "").toLowerCase();
    return type === "toolresult" || type === "tool_result";
  });
  const hasResultPhase = toolPhase === "result" || toolPhase === "completed";
  if (
    !hasToolId &&
    !hasToolRole &&
    callItems.length === 0 &&
    resultItems.length === 0 &&
    !hasResultPhase
  ) {
    return [];
  }

  const buildNode = (params: {
    name: string;
    args: unknown;
    output: string;
    hasResultSignal: boolean;
    rawToolCallId?: string;
    keySuffix: string;
  }): Extract<TimelineNode, { kind: "tool" }> => {
    const isReadTool = params.name.toLowerCase() === "read";
    const hasOutput = !isReadTool && params.output.trim().length > 0;
    const completed = params.hasResultSignal || hasOutput;
    const running = !completed;
    const display = resolveToolDisplay({ name: params.name, args: params.args });
    const detail = formatToolDetail(display);
    const summary = detail
      ? `${display.name || params.name} ${detail}`
      : display.name || params.name;
    // Only merge lifecycle updates for the same concrete tool call id.
    // Signature-based merges cause different tool invocations to collapse together.
    const mergeKey = params.rawToolCallId
      ? `tool:${params.rawToolCallId}`
      : `node:${key}:${params.keySuffix}`;
    const detailText = [
      `Tool: ${display.label}`,
      detail ? `Detail: ${detail}` : null,
      params.args != null ? `Args:\n${safeJson(params.args)}` : null,
      hasOutput ? `Output:\n${params.output.trim()}` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n");
    return {
      kind: "tool",
      key: `tool-node:${key}:${params.keySuffix}`,
      timestamp,
      mergeKey,
      summary,
      hasOutput,
      completed,
      detail: detailText,
      running,
    };
  };

  const nodes: Array<Extract<TimelineNode, { kind: "tool" }>> = [];
  for (let idx = 0; idx < callItems.length; idx++) {
    const callItem = callItems[idx];
    const name = typeof callItem.name === "string" ? callItem.name : "tool";
    const args = callItem.arguments ?? callItem.args;
    const rawToolCallId =
      (typeof callItem.id === "string" ? callItem.id : undefined) ?? messageToolCallId;
    nodes.push(
      buildNode({
        name,
        args,
        output: "",
        hasResultSignal: false,
        rawToolCallId,
        keySuffix: `call:${idx}`,
      }),
    );
  }

  if (hasToolRole || resultItems.length > 0 || hasResultPhase) {
    const name =
      (typeof resultItems[0]?.name === "string" ? resultItems[0]?.name : undefined) ??
      (typeof m.toolName === "string" ? m.toolName : undefined) ??
      (typeof m.tool_name === "string" ? m.tool_name : undefined) ??
      (typeof callItems[0]?.name === "string" ? callItems[0]?.name : undefined) ??
      "tool";
    const args = callItems[0]?.arguments ?? callItems[0]?.args;
    const output =
      extractToolResultText(resultItems[0]) ??
      extractTextCached(message) ??
      (typeof m.text === "string" ? m.text : "");
    const rawToolCallId =
      messageToolCallId ?? (typeof callItems[0]?.id === "string" ? callItems[0]?.id : undefined);
    nodes.push(
      buildNode({
        name,
        args,
        output,
        hasResultSignal: true,
        rawToolCallId,
        keySuffix: "result",
      }),
    );
  }

  return nodes;
}

function extractToolResultText(item: Record<string, unknown> | undefined): string | null {
  if (!item) {
    return null;
  }
  if (typeof item.text === "string") {
    return item.text;
  }
  if (typeof item.content === "string") {
    return item.content;
  }
  return null;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  return null;
}

function unwrapMessageEnvelope(entry: unknown): {
  message: Record<string, unknown>;
  envelope: Record<string, unknown>;
} {
  const envelope = (entry ?? {}) as Record<string, unknown>;
  const nested = envelope.message;
  if (nested && typeof nested === "object") {
    return { message: nested as Record<string, unknown>, envelope };
  }
  return { message: envelope, envelope };
}

function resolveMessageTimestamp(
  message: Record<string, unknown>,
  envelope: Record<string, unknown>,
  fallback: number,
): number {
  return parseTimestamp(message.timestamp) ?? parseTimestamp(envelope.timestamp) ?? fallback;
}

function parseSeq(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveMessageSeq(
  message: Record<string, unknown>,
  envelope: Record<string, unknown>,
): number | null {
  const messageMeta =
    message.__openclaw && typeof message.__openclaw === "object"
      ? (message.__openclaw as Record<string, unknown>)
      : null;
  const envelopeMeta =
    envelope.__openclaw && typeof envelope.__openclaw === "object"
      ? (envelope.__openclaw as Record<string, unknown>)
      : null;
  return (
    parseSeq(messageMeta?.seq) ??
    parseSeq(envelopeMeta?.seq) ??
    parseSeq(message.seq) ??
    parseSeq(envelope.seq)
  );
}

function parseToolDetailSections(detail: string): Record<string, string> {
  const out: Record<string, string> = {};
  const chunks = detail
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const match = /^([A-Za-z]+):\s*([\s\S]*)$/.exec(chunk);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = match[2]?.trim() ?? "";
    if (!value) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function mergeToolDetails(current: string, incoming: string): string {
  const a = parseToolDetailSections(current);
  const b = parseToolDetailSections(incoming);
  const merged: string[] = [];
  const tool = b.Tool ?? a.Tool;
  const detail = a.Detail ?? b.Detail;
  const args = a.Args ?? b.Args;
  const output = b.Output ?? a.Output;
  if (tool) {
    merged.push(`Tool: ${tool}`);
  }
  if (detail) {
    merged.push(`Detail: ${detail}`);
  }
  if (args) {
    merged.push(`Args:\n${args}`);
  }
  if (output) {
    merged.push(`Output:\n${output}`);
  }
  return merged.join("\n\n");
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
