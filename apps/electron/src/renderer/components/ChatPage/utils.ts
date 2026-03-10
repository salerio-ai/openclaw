import {
  defaultTitle,
  normalizeToolName,
  normalizeVerb,
  resolveActionSpec,
  resolveDetailFromKeys,
  resolveExecDetail,
  resolveReadDetail,
  resolveWebFetchDetail,
  resolveWebSearchDetail,
  resolveWriteDetail,
  type ToolDisplaySpec as ToolDisplaySpecBase,
} from "openclaw/agents/tool-display-common";
// import { stripReasoningTagsFromText } from "openclaw/shared/text/reasoning-tags";
import { extractText, extractThinking } from "../../lib/chat-extract";
import type { ChatTimelineContext, TimelineNode } from "./types";
import { TOOL_DISPLAY_CONFIG } from "./tool-display-config";
import DOMPurify from "dompurify";
import { marked } from "marked";

type ToolDisplaySpec = ToolDisplaySpecBase & {
  icon?: string;
};

type ToolDisplayConfig = {
  version?: number;
  fallback?: ToolDisplaySpec;
  tools?: Record<string, ToolDisplaySpec>;
};

export type ToolDisplay = {
  name: string;
  icon: string;
  title: string;
  label: string;
  verb?: string;
  detail?: string;
};

const DISPLAY_CONFIG = TOOL_DISPLAY_CONFIG as ToolDisplayConfig;
const FALLBACK = DISPLAY_CONFIG.fallback ?? { icon: "puzzle" };
const TOOL_MAP = DISPLAY_CONFIG.tools ?? {};

// Markdown setup
marked.setOptions({
  gfm: true,
  breaks: true,
});

const allowedTags = [
  "a", "b", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "hr",
  "i", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead",
  "tr", "ul", "img",
];

const allowedAttrs = ["class", "href", "rel", "target", "title", "start", "src", "alt"];
const sanitizeOptions = {
  ALLOWED_TAGS: allowedTags,
  ALLOWED_ATTR: allowedAttrs,
  ADD_DATA_URI_TAGS: ["img"],
};

let hooksInstalled = false;
const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const markdownCache = new Map<string, string>();

function getCachedMarkdown(key: string): string | null {
  const cached = markdownCache.get(key);
  if (cached === undefined) {
    return null;
  }
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: string) {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) {
    return;
  }
  const oldest = markdownCache.keys().next().value;
  if (oldest) {
    markdownCache.delete(oldest);
  }
}

function installHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    const href = node.getAttribute("href");
    if (!href) {
      return;
    }
    node.setAttribute("rel", "noreferrer noopener");
    node.setAttribute("target", "_blank");
  });
}

function truncateText(
  value: string,
  max: number,
): {
  text: string;
  truncated: boolean;
  total: number;
} {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length };
  }
  return {
    text: value.slice(0, Math.max(0, max)),
    truncated: true,
    total: value.length,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const htmlEscapeRenderer = new marked.Renderer();
htmlEscapeRenderer.html = ({ text }: { text: string }) => escapeHtml(text);

export function toSanitizedMarkdownHtml(markdown: string): string {
  const input = markdown.trim();
  if (!input) {
    return "";
  }
  installHooks();
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(input);
    if (cached !== null) {
      return cached;
    }
  }
  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : "";
  if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    const html = `<pre class="code-block">${escaped}</pre>`;
    const sanitized = DOMPurify.sanitize(html, sanitizeOptions);
    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(input, sanitized);
    }
    return sanitized;
  }
  const rendered = marked.parse(`${truncated.text}${suffix}`, {
    renderer: htmlEscapeRenderer,
  }) as string;
  const sanitized = DOMPurify.sanitize(rendered, sanitizeOptions);
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    setCachedMarkdown(input, sanitized);
  }
  return sanitized;
}

// Tool Display
function shortenHomeInString(input: string): string {
  if (!input) {
    return input;
  }
  const patterns = [
    { re: /^\/Users\/[^/]+(\/|$)/, replacement: "~$1" },
    { re: /^\/home\/[^/]+(\/|$)/, replacement: "~$1" },
    { re: /^C:\\Users\\[^\\]+(\\|$)/i, replacement: "~$1" },
  ] as const;

  for (const pattern of patterns) {
    if (pattern.re.test(input)) {
      return input.replace(pattern.re, pattern.replacement);
    }
  }
  return input;
}

export function resolveToolDisplay(params: {
  name?: string;
  args?: unknown;
  meta?: string;
}): ToolDisplay {
  const name = normalizeToolName(params.name);
  const key = name.toLowerCase();
  const spec = TOOL_MAP[key];
  const icon = (spec?.icon ?? FALLBACK.icon ?? "puzzle");
  const title = spec?.title ?? defaultTitle(name);
  const label = spec?.label ?? title;
  const actionRaw =
    params.args && typeof params.args === "object"
      ? ((params.args as Record<string, unknown>).action as string | undefined)
      : undefined;
  const action = typeof actionRaw === "string" ? actionRaw.trim() : undefined;
  const actionSpec = resolveActionSpec(spec, action);
  const fallbackVerb =
    key === "web_search"
      ? "search"
      : key === "web_fetch"
        ? "fetch"
        : key.replace(/_/g, " ").replace(/\./g, " ");
  const verb = normalizeVerb(actionSpec?.label ?? action ?? fallbackVerb);

  let detail: string | undefined;
  if (key === "exec") {
    detail = resolveExecDetail(params.args);
  }
  if (!detail && key === "read") {
    detail = resolveReadDetail(params.args);
  }
  if (!detail && (key === "write" || key === "edit" || key === "attach")) {
    detail = resolveWriteDetail(key, params.args);
  }
  if (!detail && key === "web_search") {
    detail = resolveWebSearchDetail(params.args);
  }
  if (!detail && key === "web_fetch") {
    detail = resolveWebFetchDetail(params.args);
  }

  const detailKeys = actionSpec?.detailKeys ?? spec?.detailKeys ?? FALLBACK.detailKeys ?? [];
  if (!detail && detailKeys.length > 0) {
    detail = resolveDetailFromKeys(params.args, detailKeys, {
      mode: "first",
      coerce: { includeFalse: true, includeZero: true },
    });
  }

  if (!detail && params.meta) {
    detail = params.meta;
  }

  if (detail) {
    detail = shortenHomeInString(detail);
  }

  return {
    name,
    icon,
    title,
    label,
    verb,
    detail,
  };
}

export function formatToolDetail(display: ToolDisplay): string | undefined {
  if (!display.detail) {
    return undefined;
  }
  if (display.detail.includes(" · ")) {
    const compact = display.detail
      .split(" · ")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(", ");
    return compact ? `with ${compact}` : undefined;
  }
  return display.detail;
}

// Timeline Logic
const CHAT_HISTORY_RENDER_LIMIT = 200;

// Helpers
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
  return parseSeq(message.seq) ?? parseSeq(envelope.seq);
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

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
  const toolPhase = typeof m.toolPhase === "string" ? m.toolPhase.toLowerCase() : "";
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
      icon: display.icon,
      label: display.label,
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
      extractText(message) ??
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

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isTextTimelineNode(node: TimelineNode): node is Extract<TimelineNode, { kind: "text" }> {
  return node.kind === "text";
}

function dedupeAdjacentAssistantTextNodes(nodes: TimelineNode[]): TimelineNode[] {
  const out: TimelineNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (
      prev &&
      isTextTimelineNode(prev) &&
      isTextTimelineNode(node) &&
      prev.tone === "assistant" &&
      node.tone === "assistant" &&
      !prev.streaming &&
      !node.streaming &&
      normalizeComparableText(prev.text) === normalizeComparableText(node.text) &&
      Math.abs(prev.timestamp - node.timestamp) <= 15_000
    ) {
      if (!prev.final && node.final) {
        out[out.length - 1] = node;
      }
      continue;
    }
    out.push(node);
  }
  return out;
}

export function buildTimelineNodes(props: ChatTimelineContext): TimelineNode[] {
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
    const normalizedRole = typeof msg?.role === "string" ? msg.role : "";
    const timestamp = resolveMessageTimestamp(msg, envelope, fallbackBaseTs + i);
    const seq = resolveMessageSeq(msg, envelope);

    if (normalizedRole.toLowerCase() === "system") {
      const textContent = extractText(msg) ?? "";
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
    const role = normalizedRole.toLowerCase();
    const stopReason = typeof msg?.stopReason === "string" ? msg.stopReason.toLowerCase() : "";
    const isFinalMessage = role === "assistant" && stopReason === "stop";
    const thinking = extractThinking(msg);
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
    const text = extractText(msg) ?? extractAssistantTerminalFallback(msg);
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
        const ordered = [...nodes]
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

  if (props.thinkingStream != null) {
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

  const ordered = [...nodes]
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

export function collapseProcessedTurn(nodes: TimelineNode[]): TimelineNode[] {
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
    if (!finalNode || !isTextTimelineNode(finalNode) || finalNode.tone !== "assistant" || !finalNode.final) {
      continue;
    }
    let turnStart = cursor;
    for (let i = finalIndex - 1; i >= cursor; i--) {
      const node = nodes[i];
      if (isTextTimelineNode(node) && node.tone === "user") {
        turnStart = i + 1;
        break;
      }
    }

    if (turnStart > cursor) {
      result.push(...nodes.slice(cursor, turnStart));
    }

    const collapsedItems = nodes
      .slice(turnStart, finalIndex)
      .filter((node) => node.kind !== "divider");
    const finalComparableText = normalizeComparableText(finalNode.text);
    while (collapsedItems.length > 0) {
      const tail = collapsedItems[collapsedItems.length - 1];
      if (
        tail &&
        isTextTimelineNode(tail) &&
        tail.tone === "assistant" &&
        !tail.final &&
        normalizeComparableText(tail.text) === finalComparableText
      ) {
        collapsedItems.pop();
        continue;
      }
      break;
    }
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
      result.push(...nodes.slice(cursor, finalIndex));
    }

    result.push(finalNode);
    cursor = finalIndex + 1;
  }

  if (cursor < nodes.length) {
    result.push(...nodes.slice(cursor));
  }

  return result;
}

export function hasRunningToolInCurrentTurn(
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

export function resolveActiveRunningToolKey(
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
