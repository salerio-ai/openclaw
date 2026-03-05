function stripThinkingTags(text: string): string {
  if (!text) {
    return text;
  }
  return text
    .replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, "")
    .trim();
}

function readRawText(message: unknown): string | null {
  const rec = message as Record<string, unknown>;
  const content = rec?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const item = entry as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (typeof rec?.text === "string") {
    return rec.text;
  }
  return null;
}

export function extractText(message: unknown): string | null {
  const rec = message as Record<string, unknown>;
  const role = typeof rec?.role === "string" ? rec.role.toLowerCase() : "";
  if (role === "thinking") {
    return null;
  }
  if (
    role === "tool" ||
    role === "toolcall" ||
    role === "tool_call" ||
    role === "toolresult" ||
    role === "tool_result"
  ) {
    return null;
  }
  const raw = readRawText(message);
  if (!raw) {
    return null;
  }
  if (role === "assistant") {
    const cleaned = stripThinkingTags(raw);
    return cleaned || null;
  }
  return raw;
}

export function extractThinking(message: unknown): string | null {
  const rec = message as Record<string, unknown>;
  const role = typeof rec?.role === "string" ? rec.role.toLowerCase() : "";
  const content = rec?.content;
  const parts: string[] = [];

  if (Array.isArray(content)) {
    for (const entry of content) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const item = entry as Record<string, unknown>;
      const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
      if (type !== "thinking" && type !== "reasoning") {
        continue;
      }
      const candidate =
        typeof item.thinking === "string"
          ? item.thinking
          : typeof item.text === "string"
            ? item.text
            : typeof item.content === "string"
              ? item.content
              : "";
      const cleaned = candidate.trim();
      if (cleaned) {
        parts.push(cleaned);
      }
    }
  }
  if (parts.length > 0) {
    return parts.join("\n");
  }

  if (role === "thinking") {
    const raw = readRawText(message);
    return raw?.trim() || null;
  }

  const text = readRawText(message);
  if (!text) {
    return null;
  }
  const matches = [...text.matchAll(/<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi)];
  const extracted = matches.map((match) => (match[1] ?? "").trim()).filter(Boolean);
  return extracted.length > 0 ? extracted.join("\n") : null;
}
