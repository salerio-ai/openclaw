import fs from "node:fs/promises";
import { resolveSessionAgentId } from "../agents/agent-scope.js";
import { readBustlyOAuthState } from "../bustly-oauth.js";
import type { OpenClawConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath, type SessionEntry } from "../config/sessions.js";

type ReportSessionCompletionParams = {
  sessionKey?: string;
  source?: string;
  conversationId?: string;
  messageSid?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  senderE164?: string;
  cfg: OpenClawConfig;
};

type ParsedMessage = {
  messageId: string;
  parentMessageId: string | null;
  role: string | null;
  contentText: string | null;
  contentJson: unknown;
  messageTimestamp: string | null;
  rawEntry: unknown;
};

type SupabaseChatRow = {
  workspace_id: string;
  user_uid: string;
  session_id: string;
  session_key: string;
  message_id: string;
  parent_message_id: string | null;
  role: string | null;
  content_text: string | null;
  content_json: unknown;
  source: string;
  conversation_id: string | null;
  message_timestamp: string | null;
  metadata: Record<string, unknown>;
};

const uploadedLineCursor = new Map<string, number>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const next = value.trim();
  return next ? next : null;
};

const toIsoTimestamp = (value: unknown): string | null => {
  if (typeof value === "string") {
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return null;
};

const getTextFromContent = (content: unknown): string | null => {
  if (typeof content === "string") {
    const value = content.trim();
    return value ? value : null;
  }
  if (Array.isArray(content)) {
    const chunks: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const rec = block as Record<string, unknown>;
      const text = trimOrNull(rec.text) ?? trimOrNull(rec.value) ?? trimOrNull(rec.output_text);
      if (text) {
        chunks.push(text);
      }
    }
    if (chunks.length > 0) {
      return chunks.join("\n").trim();
    }
    return null;
  }
  if (content && typeof content === "object") {
    const rec = content as Record<string, unknown>;
    return trimOrNull(rec.text) ?? trimOrNull(rec.value) ?? trimOrNull(rec.output_text);
  }
  return null;
};

const parseMessageLine = (line: string): ParsedMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const entry = parsed as Record<string, unknown>;
  if (entry.type !== "message") {
    return null;
  }

  const rawMessage =
    entry.message && typeof entry.message === "object"
      ? (entry.message as Record<string, unknown>)
      : entry;
  const messageId = trimOrNull(entry.id) ?? trimOrNull(rawMessage.id);
  if (!messageId) {
    return null;
  }

  return {
    messageId,
    parentMessageId: trimOrNull(entry.parentId) ?? trimOrNull(rawMessage.parentId),
    role: trimOrNull(rawMessage.role),
    contentText: getTextFromContent(rawMessage.content),
    contentJson: rawMessage.content ?? null,
    messageTimestamp: toIsoTimestamp(entry.timestamp) ?? toIsoTimestamp(rawMessage.timestamp),
    rawEntry: parsed,
  };
};

const readNewMessagesFromTranscript = async (
  sessionFile: string,
): Promise<{ messages: ParsedMessage[]; nextCursor: number }> => {
  const raw = await fs.readFile(sessionFile, "utf-8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const previousCursor = uploadedLineCursor.get(sessionFile) ?? 0;
  const cursor = previousCursor > lines.length ? 0 : previousCursor;
  const nextCursor = lines.length;
  const nextLines = lines.slice(cursor);
  const messages = nextLines
    .map(parseMessageLine)
    .filter((entry): entry is ParsedMessage => !!entry);
  return { messages, nextCursor };
};

const buildRows = (params: {
  workspaceId: string;
  userUid: string;
  sessionId: string;
  sessionKey: string;
  source: string;
  conversationId: string | null;
  messageSid: string | null;
  senderId: string | null;
  senderName: string | null;
  senderUsername: string | null;
  senderE164: string | null;
  messages: ParsedMessage[];
}): SupabaseChatRow[] => {
  return params.messages.map((msg) => ({
    workspace_id: params.workspaceId,
    user_uid: params.userUid,
    session_id: params.sessionId,
    session_key: params.sessionKey,
    message_id: msg.messageId,
    parent_message_id: msg.parentMessageId,
    role: msg.role,
    content_text: msg.contentText,
    content_json: msg.contentJson,
    source: params.source,
    conversation_id: params.conversationId,
    message_timestamp: msg.messageTimestamp,
    metadata: {
      messageSid: params.messageSid,
      senderId: params.senderId,
      senderName: params.senderName,
      senderUsername: params.senderUsername,
      senderE164: params.senderE164,
      raw: msg.rawEntry,
    },
  }));
};

const postRowsToSupabase = async (
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  rows: SupabaseChatRow[],
): Promise<void> => {
  if (rows.length === 0) {
    return;
  }

  const url = new URL("/rest/v1/client_chat_messages", supabaseUrl);
  url.searchParams.set("on_conflict", "session_id,message_id");
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`supabase chat report failed: status=${response.status} body=${text}`);
  }
};

const resolveSessionEntry = (params: {
  cfg: OpenClawConfig;
  sessionKey: string;
}): { sessionEntry?: SessionEntry; sessionId?: string; sessionFile?: string } => {
  const agentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store[params.sessionKey];
  return {
    sessionEntry: entry,
    sessionId: trimOrNull(entry?.sessionId ?? null) ?? undefined,
    sessionFile: trimOrNull(entry?.sessionFile ?? null) ?? undefined,
  };
};

export async function reportSessionCompletionToSupabase(
  params: ReportSessionCompletionParams,
): Promise<void> {
  const sessionKey = trimOrNull(params.sessionKey);
  if (!sessionKey) {
    return;
  }

  const state = readBustlyOAuthState();
  const supabase = state?.supabase;
  const user = state?.user;
  const userUid = trimOrNull(state?.user?.userId);
  const workspaceId = trimOrNull(user?.workspaceId);
  const supabaseUrl = trimOrNull(supabase?.url);
  const anonKey = trimOrNull(supabase?.anonKey);
  const accessToken = trimOrNull(user?.userAccessToken);
  if (!userUid || !workspaceId || !supabaseUrl || !anonKey || !accessToken) {
    return;
  }
  if (!UUID_RE.test(userUid) || !UUID_RE.test(workspaceId)) {
    return;
  }

  const { sessionId, sessionFile } = resolveSessionEntry({
    cfg: params.cfg,
    sessionKey,
  });
  if (!sessionId || !sessionFile) {
    return;
  }

  const { messages, nextCursor } = await readNewMessagesFromTranscript(sessionFile);
  if (messages.length === 0) {
    uploadedLineCursor.set(sessionFile, nextCursor);
    return;
  }

  const rows = buildRows({
    workspaceId,
    userUid,
    sessionId,
    sessionKey,
    source: trimOrNull(params.source) ?? "unknown",
    conversationId: trimOrNull(params.conversationId),
    messageSid: trimOrNull(params.messageSid),
    senderId: trimOrNull(params.senderId),
    senderName: trimOrNull(params.senderName),
    senderUsername: trimOrNull(params.senderUsername),
    senderE164: trimOrNull(params.senderE164),
    messages,
  });
  await postRowsToSupabase(supabaseUrl, anonKey, accessToken, rows);
  uploadedLineCursor.set(sessionFile, nextCursor);
}
