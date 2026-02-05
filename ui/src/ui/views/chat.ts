import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import type { SessionsListResult } from "../types";
import type { ChatItem, MessageGroup } from "../types/chat-types";
import type { ChatAttachment, ChatQueueItem } from "../ui-types";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer";
import { icons } from "../icons";
import { renderMarkdownSidebar } from "./markdown-sidebar";
import "../components/resizable-divider";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
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
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
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
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onViewHistory: () => void;
  showHistory: boolean;
  onToggleHistory: () => void;
  onLoadSession: (key: string) => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  placeholderText?: string;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  if (!el.value) {
    el.style.height = "";
    return;
  }
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderHistoryModal(props: ChatProps) {
  if (!props.showHistory) return nothing;

  const sessions = props.sessions?.sessions ?? [];

  return html`
    <div class="modal-overlay" @click=${props.onToggleHistory}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>Task History</h3>
          <button class="btn icon-only" @click=${props.onToggleHistory}>
            ${icons.x}
          </button>
        </div>
        <div class="modal-body history-list">
          ${
            sessions.length === 0
              ? html`
                  <div class="muted">No task history yet</div>
                `
              : sessions.map(
                  (s) => html`
                  <button
                    class="history-item ${s.key === props.sessionKey ? "active" : ""}"
                    @click=${() => {
                      props.onSessionKeyChange(s.key);
                      props.onToggleHistory();
                    }}
                  >
                    <div class="history-item__main">
                      <span class="history-item__title">${s.displayName || s.key}</span>
                      <span class="history-item__date">${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}</span>
                    </div>
                  </button>
                `,
                )
          }
        </div>
      </div>
    </div>
  `;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) return nothing;

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="callout info compaction-indicator compaction-indicator--active">
        ${icons.loader} Compressing context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="callout success compaction-indicator compaction-indicator--complete">
          ${icons.check} Context compressed
        </div>
      `;
    }
  }

  return nothing;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) return;

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) return;

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    };
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) return nothing;

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

function renderHistorySidebar(props: ChatProps) {
  const sessions = props.sessions?.sessions ?? [];
  const sortedSessions = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  return html`
    <aside class="history-sidebar">
      <button class="new-chat-btn" @click=${props.onNewSession}>
        ${icons.fileText} New Chat
      </button>
      <div class="session-list">
        <div class="session-group-title">History</div>
        ${
          sortedSessions.length === 0
            ? html`
                <div class="muted" style="padding: 0 12px; font-size: 13px">No history yet</div>
              `
            : sortedSessions.map(
                (s) => html`
                <button
                  class="session-item ${s.key === props.sessionKey ? "active" : ""}"
                  @click=${() => props.onSessionKeyChange(s.key)}
                  title="${s.displayName || s.key}"
                >
                  ${s.displayName || s.key}
                </button>
              `,
              )
        }
      </div>
    </aside>
  `;
}

function renderChatContent(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add message..."
      : (props.placeholderText ?? "Send message (Enter to send, Shift+Enter for new line)")
    : "Connect gateway to start chatting...";

  const messageCount = Array.isArray(props.messages) ? props.messages.length : 0;
  // Is Home if no messages and not loading/streaming
  const isHome = false;

  const modal = renderHistoryModal(props);

  if (isHome) {
    return html`
      <section class="card chat">
        ${modal}
        ${renderCompactionIndicator(props.compactionStatus)}
        
        <div class="chat-home">
          <div class="chat-home__header">
             <button class="chat-home__history-btn" @click=${props.onToggleHistory}>
                ${icons.book}
                Task History
             </button>
          </div>

          <div class="chat-home__hero">
             <h1>Every merchant deserves an <span class="highlight">AI analyst</span></h1>
          </div>

          <div class="chat-input-card">
             <div class="chat-input-card__inner">
                ${renderAttachmentPreview(props)}
                <textarea
                  class="chat-home__textarea"
                  ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
                  .value=${props.draft}
                  ?disabled=${!props.connected}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key !== "Enter") return;
                    if (e.isComposing || e.keyCode === 229) return;
                    if (e.shiftKey) return;
                    if (!props.connected) return;
                    e.preventDefault();
                    if (canCompose) props.onSend();
                  }}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLTextAreaElement;
                    adjustTextareaHeight(target);
                    props.onDraftChange(target.value);
                  }}
                  @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
                  placeholder=${props.connected ? (props.placeholderText ?? "How can I help you?") : "Connect gateway to start chatting..."}
                ></textarea>
                
                <div class="chat-input-card__footer">
                   <div class="chat-input-card__tools">
                   </div>
                   <button
                    class="chat-input-card__send-btn"
                    ?disabled=${!props.connected || (!props.draft.trim() && !hasAttachments)}
                    @click=${props.onSend}
                  >
                    ${icons.arrowRight}
                  </button>
                </div>
             </div>
          </div>
          
          <div class="chat-suggestions">
              <button class="chip" @click=${() => props.onDraftChange("Explain Code")}>${icons.code} Explain Code</button>
              <button class="chip" @click=${() => props.onDraftChange("Generate Report")}>${icons.fileText} Generate Report</button>
              <button class="chip" @click=${() => props.onDraftChange("Code Analysis")}>${icons.terminal} Code Analysis</button>
              <button class="chip" @click=${() => props.onDraftChange("Optimize Performance")}>${icons.zap} Optimize Performance</button>
           </div>
        </div>
      </section>
    `;
  }

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const thread = html`
     ${modal}
     <div
       class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat...</div>
            `
          : nothing
      }
      ${repeat(
        buildChatItems(props),
        (item) => item.key,
        (item) => {
          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
  `;

  return html`
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%; min-width: 0; flex: 1; min-height: 0;">
      <div style="padding: 24px 32px; flex-shrink: 0;">
        <div style="font-size: 28px; font-weight: 700; color: #1d1d1f; letter-spacing: -0.02em; margin-bottom: 4px;">Chat</div>
        <div style="font-size: 17px; color: #86868b;">Direct gateway chat session for quick interventions.</div>
      </div>

      <section class="card chat" style="flex: 1; min-height: 0; width: 100%; min-width: 0;">
        ${renderCompactionIndicator(props.compactionStatus)}

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
                    if (!props.sidebarContent || !props.onOpenSidebar) return;
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
                          (item.attachments?.length ? `Images (${item.attachments.length})` : "")
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

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              ?disabled=${!props.connected}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") return;
                if (e.isComposing || e.keyCode === 229) return;
                if (e.shiftKey) return; // Allow Shift+Enter for line breaks
                if (!props.connected) return;
                e.preventDefault();
                if (canCompose) props.onSend();
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
              @click=${props.onNewSession}
              title="Start a new session"
            >
              New session
            </button>
            ${
              canAbort
                ? html`
                  <button
                    class="btn"
                    @click=${props.onAbort}
                  >
                    Stop
                  </button>
                `
                : nothing
            }
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
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  return html`
    <div class="chat-layout">
      ${renderChatContent(props)}
    </div>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) result.push(currentGroup);
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) result.push(currentGroup);
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (hiding ${historyStart}).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) return `tool:${toolCallId}`;
  const id = typeof m.id === "string" ? m.id : "";
  if (id) return `msg:${id}`;
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) return `msg:${messageId}`;
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) return `msg:${role}:${timestamp}:${index}`;
  return `msg:${role}:${index}`;
}
