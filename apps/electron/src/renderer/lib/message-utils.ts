import type { ChatDisplayMessage, ChatDisplaySegment } from "./chat-types";

function truncateForSegment(value: string, max = 180): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeToolCallArguments(args: unknown): string | undefined {
  if (!args || typeof args !== "object") {
    return undefined;
  }
  const rec = args as Record<string, unknown>;
  const direct =
    (typeof rec.command === "string" && rec.command) ||
    (typeof rec.path === "string" && rec.path) ||
    (typeof rec.url === "string" && rec.url);
  if (direct) {
    return truncateForSegment(direct, 140);
  }
  const raw = safeJson(args);
  return raw && raw !== "{}" ? truncateForSegment(raw, 140) : undefined;
}

function normalizeAssistantSegmentsFromContent(content: unknown): ChatDisplaySegment[] {
  if (!Array.isArray(content)) {
    if (typeof content === "string" && content.trim()) {
      return [{ type: "text", text: content }];
    }
    return [];
  }

  const segments: ChatDisplaySegment[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const block = part as {
      type?: unknown;
      text?: unknown;
      thinking?: unknown;
      id?: unknown;
      name?: unknown;
      arguments?: unknown;
    };
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      segments.push({ type: "text", text: block.text });
      continue;
    }
    if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
      segments.push({ type: "thinking", text: block.thinking });
      continue;
    }
    if (block.type === "toolCall") {
      const name = typeof block.name === "string" && block.name.trim() ? block.name.trim() : "tool";
      const toolCallId = typeof block.id === "string" && block.id.trim() ? block.id.trim() : undefined;
      segments.push({
        type: "toolCall",
        name,
        toolCallId,
        status: "start",
        summary: summarizeToolCallArguments(block.arguments),
      });
    }
  }

  return segments;
}

function normalizeToolResultMessage(raw: Record<string, unknown>, index: number): ChatDisplayMessage | null {
  const toolName =
    typeof raw.toolName === "string" && raw.toolName.trim() ? raw.toolName.trim() : "tool";
  const toolCallId =
    typeof raw.toolCallId === "string" && raw.toolCallId.trim() ? raw.toolCallId.trim() : undefined;
  const details = raw.details as { status?: unknown; error?: unknown } | undefined;
  const statusRaw = typeof details?.status === "string" ? details.status : undefined;
  const isError = raw.isError === true || statusRaw === "error";

  const content = Array.isArray(raw.content) ? raw.content : [];
  const firstText = content.find(
    (entry) => entry && typeof entry === "object" && (entry as { type?: unknown }).type === "text",
  ) as { text?: unknown } | undefined;
  const summary = typeof firstText?.text === "string" ? truncateForSegment(firstText.text, 140) : undefined;

  return {
    id: `tool-result-${index}-${String(raw.timestamp ?? Date.now())}`,
    role: "assistant",
    segments: [
      {
        type: "toolCall",
        toolCallId,
        name: toolName,
        status: isError ? "error" : "completed",
        summary,
      },
    ],
  };
}

export function extractTextFromMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (!message || typeof message !== "object") {
    return "";
  }
  const maybeText = (message as { text?: unknown }).text;
  if (typeof maybeText === "string") {
    return maybeText;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const block = part as { type?: unknown; text?: unknown; thinking?: unknown };
        if (block.type === "text" && typeof block.text === "string") {
          return block.text;
        }
        if (block.type === "thinking" && typeof block.thinking === "string") {
          return block.thinking;
        }
        if (block.type === "image") {
          return "[Image]";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function normalizeHistoryMessages(rawMessages: unknown[]): ChatDisplayMessage[] {
  return rawMessages
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const message = raw as {
        role?: unknown;
        content?: unknown;
        timestamp?: unknown;
        toolCallId?: unknown;
        toolName?: unknown;
        details?: unknown;
        isError?: unknown;
      };

      if (message.role === "toolResult") {
        return normalizeToolResultMessage(message as unknown as Record<string, unknown>, index);
      }

      const role =
        message.role === "assistant" || message.role === "system" || message.role === "user"
          ? message.role
          : "assistant";

      const segments = normalizeAssistantSegmentsFromContent(message.content);
      if (segments.length === 0) {
        const text = extractTextFromMessage({ content: message.content }).trim();
        if (!text) {
          return null;
        }
        segments.push({ type: "text", text });
      }

      return {
        id: `hist-${index}-${String(message.timestamp ?? Date.now())}`,
        role,
        segments,
      } as ChatDisplayMessage;
    })
    .filter((item): item is ChatDisplayMessage => item !== null && item.segments.length > 0);
}

export function parseTokenFromWsUrl(wsUrl: string): string | undefined {
  try {
    const parsed = new URL(wsUrl);
    const token = parsed.searchParams.get("token")?.trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}
