import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity.ts";
import type { MessageGroup } from "../types/chat-types.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown.ts";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract.ts";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer.ts";
import { extractToolCards, renderToolCardSidebar } from "./tool-cards.ts";

type ImageBlock = {
  url: string;
  alt?: string;
};

/**
 * Extract image URLs from [media attached: ...] text format.
 * Handles both single file and multi-file formats:
 * - [media attached: /path/to/file.png (image/png) | /path/to/file.png]
 * - [media attached: /path/to/file.png | https://example.com/url]
 * - [media attached N/M: /path/to/file.png | url]
 */
function extractMediaAttachedImages(text: string): ImageBlock[] {
  const images: ImageBlock[] = [];
  // Match [media attached: ...] or [media attached N/M: ...]
  // Format: [media attached: localPath (mimeType) | urlOrPath] or [media attached: localPath | urlOrPath]
  const pattern = /\[media attached(?:\s+\d+\/\d+)?:\s*([^\]]+)\]/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const inner = match[1].trim();
    // Skip header lines like "[media attached: 3 files]"
    if (/^\d+\s+files?$/i.test(inner)) {
      continue;
    }
    // Extract path and optional URL - format: "path (type) | url" or "path | url"
    // The url/path after | is what we can actually use
    const pipeIndex = inner.lastIndexOf("|");
    if (pipeIndex !== -1) {
      const urlPart = inner.slice(pipeIndex + 1).trim();
      if (urlPart) {
        // Check if it's a usable URL (http/https or local path we can serve)
        if (/^https?:\/\//i.test(urlPart)) {
          images.push({ url: urlPart });
        } else {
          // It's a local path - serve via gateway media endpoint
          // The path is typically like /Users/.../media/inbound/xxx.png
          // We need to serve it via /api/media?path=...
          images.push({ url: `/api/media?path=${encodeURIComponent(urlPart)}` });
        }
      }
    } else {
      // No pipe - try to use the whole thing as a path
      // Format might be just "path (type)"
      const pathMatch = inner.match(/^(.+?)\s*(?:\([^)]+\))?$/);
      if (pathMatch?.[1]) {
        const path = pathMatch[1].trim();
        if (/^https?:\/\//i.test(path)) {
          images.push({ url: path });
        } else {
          images.push({ url: `/api/media?path=${encodeURIComponent(path)}` });
        }
      }
    }
  }
  return images;
}

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string") {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string") {
          images.push({ url: imageUrl.url });
        }
      } else if (b.type === "text" && typeof b.text === "string") {
        // Extract images from [media attached: ...] text blocks
        const mediaImages = extractMediaAttachedImages(b.text);
        images.push(...mediaImages);
      }
    }
  } else if (typeof content === "string") {
    // Handle string content - extract [media attached: ...] patterns
    const mediaImages = extractMediaAttachedImages(content);
    images.push(...mediaImages);
  }

  return images;
}

export function renderReadingIndicatorGroup(assistant?: AssistantIdentity) {
  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-reading-indicator" aria-hidden="true">
          <span class="chat-reading-indicator__dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    </div>
  `;
}

export function renderStreamingGroup(
  text: string,
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
) {
  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "Assistant";
  const who =
    normalizedRole === "user"
      ? "You"
      : normalizedRole === "assistant"
        ? assistantName
        : normalizedRole;
  const roleClass =
    normalizedRole === "user" ? "user" : normalizedRole === "assistant" ? "assistant" : "other";
  const timestamp = new Date(group.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return html`
    <div class="chat-group ${roleClass}">
      ${renderAvatar(group.role, {
        name: assistantName,
        avatar: opts.assistantAvatar ?? null,
      })}
      <div class="chat-group-messages">
        ${group.messages.map((item, index) =>
          renderGroupedMessage(
            item.message,
            {
              isStreaming: group.isStreaming && index === group.messages.length - 1,
              showReasoning: opts.showReasoning,
            },
            opts.onOpenSidebar,
          ),
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${who}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
  const assistantAvatar = assistant?.avatar?.trim() || "";
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  if (assistantAvatar && normalized === "assistant") {
    if (isAvatarUrl(assistantAvatar)) {
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
      />`;
    }
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => window.open(img.url, "_blank")}
          />
        `,
      )}
    </div>
  `;
}

function renderGroupedMessage(
  message: unknown,
  opts: { isStreaming: boolean; showReasoning: boolean },
  onOpenSidebar?: (content: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";

  const toolCards = extractToolCards(message);
  const hasToolCards = toolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  const markdownBase = extractedText?.trim() ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());

  const bubbleClasses = [
    "chat-bubble",
    canCopyMarkdown ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  if (!markdown && hasToolCards && isToolResult) {
    return html`${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}`;
  }

  if (!markdown && !hasToolCards && !hasImages) {
    return nothing;
  }

  return html`
    <div class="${bubbleClasses}">
      ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown!) : nothing}
      ${renderMessageImages(images)}
      ${
        reasoningMarkdown
          ? html`<div class="chat-thinking">${unsafeHTML(
              toSanitizedMarkdownHtml(reasoningMarkdown),
            )}</div>`
          : nothing
      }
      ${
        markdown
          ? html`<div class="chat-text">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${toolCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}
    </div>
  `;
}
