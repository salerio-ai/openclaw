import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { GatewayBrowserClient, type GatewayEventFrame } from "../../lib/gateway-client";
import { extractText, extractThinking } from "../../lib/chat-extract";
import { ChatTimeline, ChatTimelineThinkingIndicator } from "./ChatTimeline";
import { collapseProcessedTurn, resolveToolDisplay, formatToolDetail } from "./utils";
import type { TimelineNode } from "./types";
import { useAppState } from "../../providers/AppStateProvider";

type ChatRole = "user" | "assistant" | "thinking" | "system";

type Attachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
  name: string;
};

type TextItem = {
  kind: "text";
  id: string;
  sortSeq: number;
  timestamp: number;
  role: ChatRole;
  text: string;
  runId?: string;
  streaming?: boolean;
  final?: boolean;
};

type ToolStatus = "running" | "completed" | "error";

type ToolItem = {
  kind: "tool";
  id: string;
  toolCallId: string;
  sortSeq: number;
  timestamp: number;
  name: string;
  args: unknown;
  output?: string;
  status: ToolStatus;
};

type TimelineItem = TextItem | ToolItem;

type SessionUsageSummary = {
  totalTokens: number | null;
  contextTokens: number | null;
  remainingTokens: number | null;
};

type RunTerminalState = "final" | "aborted" | "error";

const DEFAULT_SESSION_KEY = "agent:main:main";
const TOOL_RUNNING_MIN_VISIBLE_MS = 600;
const SIDEBAR_TASKS_REFRESH_EVENT = "openclaw:sidebar-refresh-tasks";
const CHAT_MODEL_LEVEL_STORAGE_KEY = "bustly.chat.model-level.v1";

const CHAT_MODEL_LEVELS = [
  { id: "lite", label: "Lite", description: "Fast & efficient for daily tasks." },
  { id: "pro", label: "Pro", description: "Balanced performance for complex reasoning." },
  { id: "max", label: "Max", description: "Frontier intelligence for critical challenges." },
] as const;

type ChatModelLevelId = (typeof CHAT_MODEL_LEVELS)[number]["id"];

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function notifySidebarTasksRefresh() {
  window.dispatchEvent(new Event(SIDEBAR_TASKS_REFRESH_EVENT));
}

function resolveChannelBaseSessionKey(sessionKey: string) {
  return sessionKey.replace(/:(thread|topic|channel|group):[^:]+$/i, "");
}

function buildChannelSessionKey(sessionKey: string) {
  return `${resolveChannelBaseSessionKey(sessionKey)}:channel:${globalThis.crypto.randomUUID()}`;
}

function normalizeTextDelta(current: string, text?: string, delta?: string): string {
  if (typeof text === "string") {
    if (!current || text.length >= current.length) {
      return text;
    }
    return current;
  }
  if (typeof delta === "string") {
    return `${current}${delta}`;
  }
  return current;
}

function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "?";
  }
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return String(Math.round(value));
}

function resolveChatTerminalState(payload: {
  state?: string;
}): RunTerminalState | null {
  if (payload.state === "final" || payload.state === "aborted" || payload.state === "error") {
    return payload.state;
  }
  return null;
}

function resolveAgentTerminalState(payload: {
  stream?: string;
  data?: Record<string, unknown>;
}): RunTerminalState | null {
  if (payload.stream === "error") {
    return "error";
  }
  if (payload.stream !== "lifecycle") {
    return null;
  }
  if (payload.data?.phase !== "end") {
    return null;
  }
  return payload.data?.aborted === true ? "aborted" : "final";
}

function extractToolText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.text === "string") {
    return rec.text;
  }
  if (Array.isArray(rec.content)) {
    const parts = rec.content
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
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    if (typeof value === "symbol") {
      return value.description ? `Symbol(${value.description})` : "Symbol()";
    }
    if (typeof value === "function") {
      return "[function]";
    }
    return Object.prototype.toString.call(value);
  }
}

function parseDataUrl(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

function compareTimeline(a: TimelineItem, b: TimelineItem): number {
  if (a.sortSeq !== b.sortSeq) {
    return a.sortSeq - b.sortSeq;
  }
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  return a.id.localeCompare(b.id);
}

function readContentText(message: unknown): string | null {
  const text = extractText(message);
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  return trimmed ? text : null;
}

function readThinkingText(message: unknown): string | null {
  const text = extractThinking(message);
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  return trimmed ? text : null;
}

function isCommandMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  return (message as Record<string, unknown>).command === true;
}

function readMessageRole(message: unknown): ChatRole {
  if (!message || typeof message !== "object") {
    return "assistant";
  }
  const role =
    typeof (message as Record<string, unknown>).role === "string"
      ? (message as Record<string, unknown>).role.toLowerCase()
      : "";
  if (role === "user") {
    return "user";
  }
  if (role === "system") {
    return "system";
  }
  return "assistant";
}

function parseToolBlocks(message: unknown): Array<{ toolCallId: string; name: string; args?: unknown; output?: string }> {
  if (!message || typeof message !== "object") {
    return [];
  }
  const rec = message as Record<string, unknown>;
  const role = typeof rec.role === "string" ? rec.role.toLowerCase() : "";

  // Handle standalone tool/toolResult history messages.
  if (role === "toolresult" || role === "tool_result") {
    const toolCallId =
      typeof rec.toolCallId === "string"
        ? rec.toolCallId
        : typeof rec.id === "string"
          ? rec.id
          : "";
    if (!toolCallId) {
      return [];
    }
    return [
      {
        toolCallId,
        name: typeof rec.toolName === "string" ? rec.toolName : "tool",
        output: extractToolText(rec.content ?? rec.text ?? rec.output ?? rec),
      },
    ];
  }
  if (role === "toolcall" || role === "tool_call" || role === "tool") {
    const toolCallId = typeof rec.id === "string" ? rec.id : "";
    if (!toolCallId) {
      return [];
    }
    return [
      {
        toolCallId,
        name: typeof rec.name === "string" ? rec.name : "tool",
        args: rec.arguments ?? rec.args ?? {},
      },
    ];
  }

  const content = Array.isArray(rec.content) ? rec.content : [];
  const calls = new Map<string, { toolCallId: string; name: string; args: unknown; output?: string }>();
  for (const raw of content) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const item = raw as Record<string, unknown>;
    const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
    if (type === "toolcall") {
      const toolCallId = typeof item.id === "string" ? item.id : "";
      if (!toolCallId) {
        continue;
      }
      const name = typeof item.name === "string" ? item.name : "tool";
      calls.set(toolCallId, {
        toolCallId,
        name,
        args: item.arguments ?? item.args ?? {},
      });
      continue;
    }
    if (type === "toolresult" || type === "tool_result") {
      const toolCallId =
        typeof item.toolCallId === "string"
          ? item.toolCallId
          : typeof item.id === "string"
            ? item.id
            : "";
      if (!toolCallId) {
        continue;
      }
      const existing = calls.get(toolCallId);
      const output = extractToolText(item.text ?? item.content ?? item.output ?? item);
      calls.set(toolCallId, {
        toolCallId,
        name: typeof item.name === "string" ? item.name : existing?.name ?? "tool",
        args: existing?.args,
        output,
      });
    }
  }
  return [...calls.values()];
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
      <path
        d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.84-8.83a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.48a1.5 1.5 0 1 1-2.12-2.12l7.78-7.78"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[14px] w-[14px]">
      <path d="m12 19 0-14" strokeLinecap="round" />
      <path d="m5 12 7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return <div className="h-[9px] w-[9px] rounded-[1px] bg-white" />;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
      <path d="M18 6 6 18" strokeLinecap="round" />
      <path d="m6 6 12 12" strokeLinecap="round" />
    </svg>
  );
}

function CaretDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.7 9.3a1 1 0 0 1 1.4 0L12 13.17l3.9-3.88a1 1 0 0 1 1.4 1.42l-4.6 4.58a1 1 0 0 1-1.4 0L6.7 10.7a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m5 12 4.2 4.2L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatPage() {
  const { gatewayReady } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [compactingRunId, setCompactingRunId] = useState<string | null>(null);
  const [sessionUsage, setSessionUsage] = useState<SessionUsageSummary>({
    totalTokens: null,
    contextTokens: null,
    remainingTokens: null,
  });
  const [streamUpdatedAt, setStreamUpdatedAt] = useState<number | null>(null);
  const [modelLevelOpen, setModelLevelOpen] = useState(false);
  const [modelMenuPos, setModelMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [modelLevel, setModelLevel] = useState<ChatModelLevelId>(() => {
    const stored = window.localStorage.getItem(CHAT_MODEL_LEVEL_STORAGE_KEY);
    if (stored === "lite" || stored === "pro" || stored === "max") {
      return stored;
    }
    return "pro";
  });

  const clientRef = useRef<GatewayBrowserClient | null>(null);
  const seqCounterRef = useRef(1_000_000_000);
  const toolTimersRef = useRef<Map<string, number>>(new Map());
  const runSeqBaseRef = useRef<Map<string, number>>(new Map());
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const streamSegmentsRef = useRef<
    Map<
      string,
      {
        assistant: number;
        assistantClosed: boolean;
        thinking: number;
        thinkingOpen: boolean;
      }
    >
  >(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentSessionKey = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("session") ?? DEFAULT_SESSION_KEY;
  }, [location.search]);

  const loadGatewayStatus = useCallback(async () => {
    const status = await window.electronAPI.gatewayStatus();
    setGateway(status);
    return status;
  }, []);

  const loadSessionUsage = useCallback(async (client: GatewayBrowserClient, sessionKey: string) => {
    const res = await client.request<{
      defaults?: { contextTokens?: number | null };
      sessions?: Array<{
        key: string;
        totalTokens?: number;
        contextTokens?: number;
      }>;
    }>("sessions.list", {});
    const row = Array.isArray(res.sessions)
      ? res.sessions.find((entry) => entry?.key === sessionKey)
      : undefined;
    const totalTokens = typeof row?.totalTokens === "number" ? row.totalTokens : null;
    const contextTokens =
      typeof row?.contextTokens === "number"
        ? row.contextTokens
        : typeof res.defaults?.contextTokens === "number"
          ? res.defaults.contextTokens
          : null;
    const remainingTokens =
      typeof totalTokens === "number" && typeof contextTokens === "number"
        ? Math.max(0, contextTokens - totalTokens)
        : null;
    setSessionUsage({ totalTokens, contextTokens, remainingTokens });
  }, []);

  const refreshSessionUsage = useCallback(
    (client: GatewayBrowserClient, sessionKey: string) => {
      void loadSessionUsage(client, sessionKey).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [loadSessionUsage],
  );

  const appendOrUpdateText = useCallback((params: {
    key: string;
    role: ChatRole;
    runId?: string;
    seq: number;
    text?: string;
    delta?: string;
    timestamp?: number;
    streaming?: boolean;
    final?: boolean;
  }) => {
    setTimeline((prev) => {
      const idx = prev.findIndex((item) => item.kind === "text" && item.id === params.key);
      const ts = params.timestamp ?? Date.now();
      if (idx === -1) {
        const nextText = normalizeTextDelta("", params.text, params.delta);
        if (!nextText.trim()) {
          return prev;
        }
        const next: TextItem = {
          kind: "text",
          id: params.key,
          sortSeq: params.seq,
          timestamp: ts,
          role: params.role,
          text: nextText,
          runId: params.runId,
          streaming: params.streaming,
          final: params.final,
        };
        return [...prev, next].toSorted(compareTimeline);
      }
      const current = prev[idx] as TextItem;
      const nextText = normalizeTextDelta(current.text, params.text, params.delta);
      if (nextText === current.text && current.streaming === params.streaming && current.final === params.final) {
        return prev;
      }
      const next = [...prev];
      next[idx] = {
        ...current,
        text: nextText,
        sortSeq: Math.min(current.sortSeq, params.seq),
        streaming: params.streaming,
        final: params.final ?? current.final,
      };
      return next;
    });
  }, []);

  const markRunFinished = useCallback((runId: string | null) => {
    if (!runId) {
      return;
    }
    setTimeline((prev) =>
      prev.map((item) => {
        if (item.kind !== "text") {
          return item;
        }
        if (item.runId !== runId) {
          return item;
        }
        if (!item.streaming) {
          return item;
        }
        return { ...item, streaming: false };
      }),
    );
  }, []);

  const markLastAssistantAsFinal = useCallback((runId: string | null) => {
    if (!runId) {
      return;
    }
    setTimeline((prev) => {
      let targetId: string | null = null;
      for (const item of prev) {
        if (item.kind !== "text") {
          continue;
        }
        if (item.runId !== runId || item.role !== "assistant") {
          continue;
        }
        if (!targetId) {
          targetId = item.id;
          continue;
        }
        const current = prev.find((entry) => entry.kind === "text" && entry.id === targetId) as
          | TextItem
          | undefined;
        if (!current) {
          targetId = item.id;
          continue;
        }
        if (item.sortSeq > current.sortSeq || (item.sortSeq === current.sortSeq && item.timestamp >= current.timestamp)) {
          targetId = item.id;
        }
      }
      if (!targetId) {
        return prev;
      }
      let changed = false;
      const next = prev.map((item) => {
        if (item.kind !== "text" || item.runId !== runId || item.role !== "assistant") {
          return item;
        }
        const shouldBeFinal = item.id === targetId;
        if (item.final === shouldBeFinal) {
          return item;
        }
        changed = true;
        return { ...item, final: shouldBeFinal };
      });
      return changed ? next : prev;
    });
  }, []);

  const finalizeRunState = useCallback((runId: string | null) => {
    markRunFinished(runId);
    setActiveRunId((prev) => (prev === runId ? null : prev));
    setCompactingRunId((prev) => (prev === runId ? null : prev));
    if (runId) {
      runSeqBaseRef.current.delete(runId);
    }
    streamSegmentsRef.current.delete(runId ?? "__unknown__");
  }, [markRunFinished]);

  const upsertTool = useCallback((params: {
    toolCallId: string;
    seq: number;
    timestamp: number;
    name: string;
    args?: unknown;
    phase: "start" | "update" | "result";
    output?: string;
    isError?: boolean;
  }) => {
    const key = `tool:${params.toolCallId}`;
    const applyCompletion = (status: ToolStatus, output?: string) => {
      setTimeline((prev) => {
        const idx = prev.findIndex((item) => item.kind === "tool" && item.id === key);
        if (idx === -1) {
          return prev;
        }
        const current = prev[idx] as ToolItem;
        const next = [...prev];
        next[idx] = {
          ...current,
          status,
          output: output ?? current.output,
        };
        return next;
      });
    };

    setTimeline((prev) => {
      const idx = prev.findIndex((item) => item.kind === "tool" && item.id === key);
      if (idx === -1) {
        const created: ToolItem = {
          kind: "tool",
          id: key,
          toolCallId: params.toolCallId,
          sortSeq: params.seq,
          timestamp: params.timestamp,
          name: params.name,
          args: params.args ?? {},
          output: params.output,
          status: params.phase === "result" ? (params.isError ? "error" : "completed") : "running",
        };
        return [...prev, created].toSorted(compareTimeline);
      }
      const current = prev[idx] as ToolItem;
      const next = [...prev];
      const nextStatus =
        params.phase === "result"
          ? params.isError
            ? "error"
            : "completed"
          : current.status;
      next[idx] = {
        ...current,
        name: params.name || current.name,
        args: params.phase === "start" ? params.args ?? current.args : current.args,
        output: params.phase === "result" ? (params.output ?? current.output) : current.output,
        sortSeq: Math.min(current.sortSeq, params.seq),
        status: nextStatus,
      };
      return next;
    });

    if (params.phase === "result") {
      const timerMap = toolTimersRef.current;
      const existing = timerMap.get(key);
      if (existing != null) {
        window.clearTimeout(existing);
      }
      const startedAt = Date.now();
      const timer = window.setTimeout(() => {
        applyCompletion(params.isError ? "error" : "completed", params.output);
        timerMap.delete(key);
      }, TOOL_RUNNING_MIN_VISIBLE_MS);
      timerMap.set(key, timer);

      window.setTimeout(() => {
        const still = timerMap.get(key);
        if (still === timer) {
          window.clearTimeout(timer);
          timerMap.delete(key);
          applyCompletion(params.isError ? "error" : "completed", params.output);
        }
      }, TOOL_RUNNING_MIN_VISIBLE_MS + 20);

      // If tool already visible long enough, complete immediately
      setTimeline((prev) => {
        const idx = prev.findIndex((item) => item.kind === "tool" && item.id === key);
        if (idx === -1) {
          return prev;
        }
        const current = prev[idx] as ToolItem;
        const visibleMs = startedAt - current.timestamp;
        if (visibleMs < TOOL_RUNNING_MIN_VISIBLE_MS) {
          return prev;
        }
        if (timerMap.has(key)) {
          window.clearTimeout(timerMap.get(key));
          timerMap.delete(key);
        }
        const next = [...prev];
        next[idx] = {
          ...current,
          status: params.isError ? "error" : "completed",
          output: params.output ?? current.output,
        };
        return next;
      });
    }
  }, []);

  const resetSessionView = useCallback(() => {
    setTimeline([]);
    setDraft("");
    setAttachments([]);
    setActiveRunId(null);
    setCompactingRunId(null);
    setSessionUsage({
      totalTokens: null,
      contextTokens: null,
      remainingTokens: null,
    });
    setStreamUpdatedAt(null);
    setError(null);
    seqCounterRef.current = 1_000_000_000;
    streamSegmentsRef.current.clear();
    runSeqBaseRef.current.clear();
    for (const timer of toolTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    toolTimersRef.current.clear();
  }, []);

  const loadHistory = useCallback(async (client: GatewayBrowserClient, sessionKey: string) => {
    const res = await client.request<{ messages?: unknown[] }>("chat.history", {
      sessionKey,
      limit: 200,
    });
    const history = Array.isArray(res.messages) ? res.messages : [];
    console.log("[electron-chat] chat.history loaded", { count: history.length, sessionKey });
    const items: TimelineItem[] = [];
    const toolsByCallId = new Map<string, ToolItem>();
    let fallbackSeq = 1;

    for (const message of history) {
      console.log("[electron-chat] history message", message);
      if (!message || typeof message !== "object") {
        continue;
      }
      const rec = message as Record<string, unknown>;
      const nested =
        rec.message && typeof rec.message === "object" ? (rec.message as Record<string, unknown>) : null;
      const role = typeof rec.role === "string" ? rec.role.toLowerCase() : "";
      const stopReasonRaw =
        (typeof rec.stopReason === "string" ? rec.stopReason : undefined) ??
        (typeof nested?.stopReason === "string" ? nested.stopReason : undefined) ??
        "";
      const stopReason = stopReasonRaw.toLowerCase();
      const timestamp =
        typeof rec.timestamp === "number"
          ? rec.timestamp
          : typeof rec.ts === "number"
            ? rec.ts
            : Date.now();
      const baseSeq = typeof rec.seq === "number" ? rec.seq : fallbackSeq++;

      const thinking = readThinkingText(message);
      if (thinking) {
        items.push({
          kind: "text",
          id: nextId("history-thinking"),
          sortSeq: baseSeq,
          timestamp,
          role: "thinking",
          text: thinking,
          streaming: false,
        });
      }

      const text = readContentText(message);
      if (text) {
        const textRole: ChatRole =
          role === "user"
            ? "user"
            : role === "assistant"
              ? "assistant"
              : role === "system"
                ? "system"
                : "assistant";
        items.push({
          kind: "text",
          id: nextId("history-text"),
          sortSeq: baseSeq + 0.01,
          timestamp,
          role: textRole,
          text,
          streaming: false,
          final: textRole === "assistant" && stopReason === "stop",
        });
      }

      const tools = parseToolBlocks(message);
      for (const tool of tools) {
        const existing = toolsByCallId.get(tool.toolCallId);
        if (!existing) {
          toolsByCallId.set(tool.toolCallId, {
            kind: "tool",
            id: `tool:${tool.toolCallId}`,
            toolCallId: tool.toolCallId,
            sortSeq: baseSeq + 0.02,
            timestamp,
            name: tool.name,
            args: tool.args,
            output: tool.output,
            status: tool.output ? "completed" : "running",
          });
          continue;
        }
        toolsByCallId.set(tool.toolCallId, {
          ...existing,
          sortSeq: Math.min(existing.sortSeq, baseSeq + 0.02),
          timestamp: Math.min(existing.timestamp, timestamp),
          name: tool.name || existing.name,
          args: tool.args ?? existing.args,
          output: tool.output ?? existing.output,
          status: tool.output ? "completed" : existing.status,
        });
      }
    }

    items.push(...toolsByCallId.values());
    setTimeline(items.toSorted(compareTimeline));
  }, []);

  const connectGateway = useCallback(
    async (status: GatewayStatus) => {
      if (!status.running) {
        setConnected(false);
        return;
      }
      let connectConfig: GatewayConnectConfig;
      try {
        connectConfig = await window.electronAPI.gatewayConnectConfig();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        setError(`Gateway connect config unavailable: ${reason}`);
        setConnected(false);
        return;
      }
      if (!connectConfig.token || !connectConfig.wsUrl) {
        setError("Gateway token missing in config; cannot connect.");
        setConnected(false);
        return;
      }
      const client = new GatewayBrowserClient({
        url: connectConfig.wsUrl,
        token: connectConfig.token ?? undefined,
        clientName: "openclaw-control-ui",
        mode: "webchat",
        instanceId: `bustly-electron-chat-${Date.now()}`,
        onHello: () => {
          setConnected(true);
          setError(null);
          void loadHistory(client, currentSessionKey).catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          });
          void loadSessionUsage(client, currentSessionKey).catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        },
        onClose: ({ code, reason, error: closeError }) => {
          setConnected(false);
          const message = closeError?.message || `disconnected (${code}): ${reason || "no reason"}`;
          setError(message);
        },
        onEvent: (evt: GatewayEventFrame) => {
          if (evt.event === "health") {
            return;
          }
          console.log("[electron-chat] received event", evt.event, evt.payload);
          if (evt.event === "chat") {
            const payload = evt.payload as {
              runId?: string;
              state?: string;
              sessionKey?: string;
              message?: unknown;
              errorMessage?: string;
            };
            if (!payload || payload.sessionKey !== currentSessionKey) {
              return;
            }
            const runId = typeof payload.runId === "string" ? payload.runId : null;
            const terminalState = resolveChatTerminalState(payload);
            if (payload.state === "delta") {
              return;
            }
            if (terminalState === "final") {
              finalizeRunState(runId);
              if (!payload.message) {
                return;
              }
              const messageText = readContentText(payload.message);
              if (!messageText) {
                return;
              }
              const timestamp =
                payload.message &&
                typeof payload.message === "object" &&
                typeof (payload.message as { timestamp?: unknown }).timestamp === "number"
                  ? (payload.message as { timestamp: number }).timestamp
                  : Date.now();
              const command = isCommandMessage(payload.message);
              const role = command ? "system" : readMessageRole(payload.message);
              appendOrUpdateText({
                key: command && runId ? `run:${runId}:command:status` : `chat:${runId ?? nextId("final")}`,
                role,
                runId: runId ?? undefined,
                seq: seqCounterRef.current++,
                text: messageText,
                timestamp,
                streaming: false,
                final: role === "assistant",
              });
              if (role === "assistant") {
                markLastAssistantAsFinal(runId);
              }
              if (command) {
                void loadHistory(client, currentSessionKey).catch((err) => {
                  setError(err instanceof Error ? err.message : String(err));
                });
                refreshSessionUsage(client, currentSessionKey);
              }
              notifySidebarTasksRefresh();
              return;
            }
            if (terminalState === "aborted" || terminalState === "error") {
              finalizeRunState(runId);
              const statusText =
                terminalState === "aborted"
                  ? "Request aborted."
                  : `Run error: ${payload.errorMessage ?? "unknown error"}`;
              const statusKey = runId ? `run:${runId}:command:status` : nextId("chat-status");
              setTimeline((prev) => {
                const idx = prev.findIndex((item) => item.kind === "text" && item.id === statusKey);
                if (idx === -1) {
                  if (terminalState === "aborted" && runId) {
                    return prev;
                  }
                  const next: TextItem = {
                    kind: "text",
                    id: statusKey,
                    sortSeq: seqCounterRef.current++,
                    timestamp: Date.now(),
                    role: "system",
                    text: statusText,
                    runId: runId ?? undefined,
                    streaming: false,
                  };
                  return [...prev, next].toSorted(compareTimeline);
                }
                const current = prev[idx] as TextItem;
                if (current.text === statusText && current.streaming === false) {
                  return prev;
                }
                const next = [...prev];
                next[idx] = {
                  ...current,
                  text: statusText,
                  streaming: false,
                };
                return next;
              });
              void loadHistory(client, currentSessionKey).catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
              });
              refreshSessionUsage(client, currentSessionKey);
              notifySidebarTasksRefresh();
              return;
            }
            return;
          }
          if (evt.event === "agent") {
            const payload = evt.payload as {
              runId?: string;
              seq?: number;
              stream?: string;
              ts?: number;
              sessionKey?: string;
              data?: Record<string, unknown>;
            };
            if (!payload || payload.sessionKey !== currentSessionKey) {
              return;
            }
            const runId = typeof payload.runId === "string" ? payload.runId : null;
            let seq = seqCounterRef.current++;
            if (runId) {
              let base = runSeqBaseRef.current.get(runId);
              if (base == null) {
                base = seqCounterRef.current;
                runSeqBaseRef.current.set(runId, base);
                seqCounterRef.current += 100_000;
              }
              if (typeof payload.seq === "number" && Number.isFinite(payload.seq)) {
                seq = base + payload.seq;
              } else {
                seq = base + (seqCounterRef.current++ % 100_000);
              }
            } else if (typeof payload.seq === "number" && Number.isFinite(payload.seq)) {
              seq = payload.seq;
            }
            const ts = typeof payload.ts === "number" ? payload.ts : Date.now();
            const stream = typeof payload.stream === "string" ? payload.stream : "";
            const data = payload.data ?? {};
            const runKey = runId ?? "__unknown__";
            const segmentState =
              streamSegmentsRef.current.get(runKey) ??
              { assistant: 0, assistantClosed: true, thinking: 0, thinkingOpen: false };

            if (
              runId &&
              stream !== "lifecycle" &&
              stream !== "error"
            ) {
              setActiveRunId(runId);
            }

            if (stream === "assistant") {
              const isFinalChunk = data.final === true;
              if (segmentState.assistant === 0 || segmentState.assistantClosed) {
                segmentState.assistant += 1;
                segmentState.assistantClosed = false;
              }
              streamSegmentsRef.current.set(runKey, segmentState);
              appendOrUpdateText({
                key: `run:${runId ?? "unknown"}:assistant:${segmentState.assistant}`,
                role: "assistant",
                runId: runId ?? undefined,
                seq,
                text: typeof data.text === "string" ? data.text : undefined,
                delta: typeof data.delta === "string" ? data.delta : undefined,
                timestamp: ts,
                streaming: !isFinalChunk,
                final: false,
              });
              if (isFinalChunk) {
                segmentState.assistantClosed = true;
                streamSegmentsRef.current.set(runKey, segmentState);
              }
              setStreamUpdatedAt(Date.now());
              return;
            }

            if (stream === "thinking") {
              if (!segmentState.thinkingOpen) {
                segmentState.thinking += 1;
                segmentState.thinkingOpen = true;
              }
              streamSegmentsRef.current.set(runKey, segmentState);
              appendOrUpdateText({
                key: `run:${runId ?? "unknown"}:thinking:${segmentState.thinking}`,
                role: "thinking",
                runId: runId ?? undefined,
                seq,
                text: typeof data.text === "string" ? data.text : undefined,
                delta: typeof data.delta === "string" ? data.delta : undefined,
                timestamp: ts,
                streaming: true,
              });
              return;
            }

            if (stream === "tool") {
              segmentState.thinkingOpen = false;
              streamSegmentsRef.current.set(runKey, segmentState);
              const phase =
                data.phase === "start" || data.phase === "update" || data.phase === "result"
                  ? data.phase
                  : "update";
              const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
              if (!toolCallId) {
                return;
              }
              upsertTool({
                toolCallId,
                seq,
                timestamp: ts,
                name: typeof data.name === "string" ? data.name : "tool",
                args: data.args,
                phase,
                output: typeof data.output === "string" ? data.output : extractToolText(data.output),
                isError: data.isError === true,
              });
              return;
            }

            if (stream === "compaction") {
              const phase = typeof data.phase === "string" ? data.phase : "";
              if (phase === "start" && runId) {
                setCompactingRunId(runId);
              }
              if (phase === "end" || phase === "error") {
                setCompactingRunId((prev) => (prev === runId ? null : prev));
                refreshSessionUsage(client, currentSessionKey);
              }
              return;
            }

            const terminalState = resolveAgentTerminalState({ stream, data });
            if (terminalState) {
              finalizeRunState(runId);
              if (terminalState === "final") {
                markLastAssistantAsFinal(runId);
              }
              if (terminalState === "aborted") {
                const stopReason = typeof data.stopReason === "string" ? data.stopReason : "aborted";
                setTimeline((prev) => {
                  const next: TextItem = {
                    kind: "text",
                    id: nextId("aborted"),
                    sortSeq: seq,
                    timestamp: ts,
                    role: "system",
                    text: `Request aborted (${stopReason}).`,
                    runId: runId ?? undefined,
                    streaming: false,
                  };
                  return [...prev, next].toSorted(compareTimeline);
                });
              }
              refreshSessionUsage(client, currentSessionKey);
              notifySidebarTasksRefresh();
              return;
            }
            return;
          }
        },
      });
      clientRef.current?.stop();
      clientRef.current = client;
      client.start();
    },
    [
      appendOrUpdateText,
      currentSessionKey,
      finalizeRunState,
      loadHistory,
      refreshSessionUsage,
      markLastAssistantAsFinal,
      upsertTool,
    ],
  );

  useEffect(() => {
    if (!gatewayReady) {
      setConnected(false);
      setLoading(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await loadGatewayStatus();
        if (cancelled) {
          return;
        }
        await connectGateway(status);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    const interval = window.setInterval(() => {
      void loadGatewayStatus()
        .then((status) => {
          setGateway(status);
          if (!status.running) {
            setConnected(false);
          }
        })
        .catch(() => {});
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      clientRef.current?.stop();
      clientRef.current = null;
      for (const timer of toolTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      toolTimersRef.current.clear();
    };
  }, [connectGateway, gatewayReady, loadGatewayStatus]);

  useEffect(() => {
    resetSessionView();
    setLoading(true);
    const client = clientRef.current;
    if (!connected || !client) {
      setLoading(false);
      return;
    }
    void loadHistory(client, currentSessionKey)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
    void loadSessionUsage(client, currentSessionKey).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [connected, currentSessionKey, loadHistory, loadSessionUsage, resetSessionView]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [timeline]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [draft]);

  const handleStartGateway = useCallback(async () => {
    setError(null);
    const result = await window.electronAPI.gatewayStart();
    if (!result.success) {
      setError(result.error ?? "Failed to start gateway");
      return;
    }
    const status = await loadGatewayStatus();
    await connectGateway(status);
  }, [connectGateway, loadGatewayStatus]);

  const handleSend = useCallback(async () => {
    const msg = draft.trim();
    if (!connected || (!msg && attachments.length === 0) || sending || !clientRef.current) {
      return;
    }

    const localSeq = seqCounterRef.current++;
    const userItem: TextItem = {
      kind: "text",
      id: nextId("user"),
      sortSeq: localSeq,
      timestamp: Date.now(),
      role: "user",
      text: draft,
      streaming: false,
    };
    setTimeline((prev) => [...prev, userItem].sort(compareTimeline));
    setDraft("");
    setAttachments([]);
    setSending(true);
    setError(null);

    const idempotencyKey = nextId("run");
    setActiveRunId(idempotencyKey);
    setCompactingRunId(null);

    try {
      const apiAttachments = attachments
        .map((att) => {
          const parsed = parseDataUrl(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((att): att is { type: "image"; mimeType: string; content: string } => Boolean(att));

      await clientRef.current.request("chat.send", {
        sessionKey: currentSessionKey,
        message: msg,
        deliver: false,
        idempotencyKey,
        attachments: apiAttachments.length > 0 ? apiAttachments : undefined,
      });
      notifySidebarTasksRefresh();
      void loadSessionUsage(clientRef.current, currentSessionKey).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActiveRunId(null);
      setCompactingRunId(null);
    } finally {
      setSending(false);
    }
  }, [attachments, connected, currentSessionKey, draft, sending]);

  const handleAbort = useCallback(async () => {
    if (!connected || !clientRef.current) {
      return;
    }
    try {
      await clientRef.current.request("chat.abort", {
        sessionKey: currentSessionKey,
        runId: activeRunId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeRunId, connected, currentSessionKey]);

  const handleNewChannel = useCallback(async () => {
    const nextSessionKey = buildChannelSessionKey(currentSessionKey);
    void navigate(`/chat?session=${encodeURIComponent(nextSessionKey)}`);
  }, [currentSessionKey, navigate]);

  const handleAttachmentFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener(
          "load",
          () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }
            reject(new Error("Unexpected file reader result type"));
          },
          { once: true },
        );
        reader.addEventListener(
          "error",
          () => {
            reject(reader.error ?? new Error("Failed to read image"));
          },
          { once: true },
        );
        reader.readAsDataURL(file);
      });
      if (!dataUrl) {
        continue;
      }
      next.push({
        id: nextId("att"),
        dataUrl,
        mimeType: file.type,
        name: file.name,
      });
    }
    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  }, []);

  const runningTools = useMemo(
    () => timeline.filter((item) => item.kind === "tool" && item.status === "running").length,
    [timeline],
  );

  const hasRecentTextStream = useMemo(() => {
    if (!streamUpdatedAt) {
      return false;
    }
    return Date.now() - streamUpdatedAt < 700;
  }, [streamUpdatedAt, timeline.length]);

  const activeRunningToolId = useMemo(() => {
    let latest: ToolItem | null = null;
    for (const entry of timeline) {
      if (entry.kind !== "tool" || entry.status !== "running") {
        continue;
      }
      if (!latest || entry.sortSeq > latest.sortSeq) {
        latest = entry;
      }
    }
    return latest?.id ?? null;
  }, [timeline]);

  const processedTimeline = useMemo(() => {
    const rawNodes: TimelineNode[] = timeline.map((item) => {
      if (item.kind === "text") {
        return {
          kind: "text",
          key: item.id,
          timestamp: item.timestamp,
          text: item.text,
          tone:
            item.role === "thinking"
              ? "thinking"
              : item.role === "system"
                ? "system"
                : item.role === "user"
                  ? "user"
                  : "assistant",
          streaming: item.streaming,
          final: item.final === true,
        };
      }
      const display = resolveToolDisplay({ name: item.name, args: item.args });
      const detail = formatToolDetail(display);
      const summary = detail ? `${display.label}: ${detail}` : display.label;

      const detailText = [
        `Tool: ${display.label}`,
        detail ? `Detail: ${detail}` : null,
        item.args != null ? `Args:\n${JSON.stringify(item.args, null, 2)}` : null,
        item.output ? `Output:\n${item.output}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        kind: "tool",
        key: item.id,
        timestamp: item.timestamp,
        mergeKey: item.toolCallId,
        icon: display.icon,
        label: display.label,
        summary,
        detail: detailText,
        hasOutput: !!item.output,
        completed: item.status !== "running",
        running: item.status === "running",
      };
    });
    return collapseProcessedTurn(rawNodes);
  }, [timeline]);

  const activeRunningToolKey = activeRunningToolId ? activeRunningToolId : null;
  const contextUsageLabel = useMemo(() => {
    if (sessionUsage.contextTokens == null) {
      return "Context left: ?";
    }
    return `Context left: ${formatTokenCount(sessionUsage.remainingTokens)} / ${formatTokenCount(sessionUsage.contextTokens)}`;
  }, [sessionUsage.contextTokens, sessionUsage.remainingTokens]);
  const selectedModelLevel = useMemo(
    () => CHAT_MODEL_LEVELS.find((entry) => entry.id === modelLevel) ?? CHAT_MODEL_LEVELS[1],
    [modelLevel],
  );

  useEffect(() => {
    window.localStorage.setItem(CHAT_MODEL_LEVEL_STORAGE_KEY, modelLevel);
  }, [modelLevel]);

  useEffect(() => {
    if (!modelLevelOpen) {
      return;
    }
    const syncMenuPosition = () => {
      const rect = modelTriggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const viewportPadding = 12;
      const width = 280;
      const gap = 8;
      const desiredMaxHeight = 264;
      let left = rect.left;
      if (left + width + viewportPadding > window.innerWidth) {
        left = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
      }
      const spaceBelow = window.innerHeight - (rect.bottom + gap) - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        180,
        Math.min(desiredMaxHeight, shouldOpenUp ? spaceAbove - gap : spaceBelow),
      );
      setModelMenuPos({
        top: shouldOpenUp
          ? Math.max(viewportPadding, rect.top - gap - maxHeight)
          : rect.bottom + gap,
        left,
        width,
        maxHeight,
      });
    };
    syncMenuPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !modelMenuRef.current?.contains(target) &&
        !modelTriggerRef.current?.contains(target)
      ) {
        setModelLevelOpen(false);
      }
    };
    window.addEventListener("resize", syncMenuPosition);
    window.addEventListener("scroll", syncMenuPosition, true);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", syncMenuPosition);
      window.removeEventListener("scroll", syncMenuPosition, true);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [modelLevelOpen]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-gray-900">
      <div className="sticky top-0 z-20 flex h-14 flex-none items-center border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex w-full items-center justify-between px-6">
          <div className="relative">
            <button
              ref={modelTriggerRef}
              type="button"
              onClick={() => setModelLevelOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition-all ${
                modelLevelOpen
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="text-gray-900">{selectedModelLevel.label}</span>
              <CaretDownIcon className={`h-3.5 w-3.5 text-gray-500 transition-transform ${modelLevelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                connected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {connected ? "Connected" : "Disconnected"}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
              Port {gateway?.port ?? "-"}
            </span>
            {!gateway?.running ? (
              <button
                type="button"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                onClick={() => {
                  void handleStartGateway();
                }}
              >
                Start Gateway
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto mt-4 w-full max-w-3xl rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {modelLevelOpen && modelMenuPos
        ? createPortal(
            <div
              ref={modelMenuRef}
              className="fixed z-[10050] rounded-xl border border-gray-100 bg-white p-2 shadow-xl"
              style={{ top: modelMenuPos.top, left: modelMenuPos.left, width: modelMenuPos.width }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ maxHeight: modelMenuPos.maxHeight }} className="flex flex-col gap-1 overflow-y-auto">
                {CHAT_MODEL_LEVELS.map((option) => {
                  const selected = option.id === modelLevel;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setModelLevel(option.id);
                        setModelLevelOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                        selected
                          ? "bg-[#1A162F]/10 text-[#1A162F]"
                          : "text-gray-500 hover:bg-[#1A162F]/5 hover:text-gray-900"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{option.label}</span>
                        {selected ? <CheckIcon className="h-4 w-4 text-[#1A162F]" /> : null}
                      </div>
                      <div className="mt-0.5 text-xs opacity-70">{option.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} className="chat-page-timeline h-full">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-8 pb-48">
            {loading ? (
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-500">
                Loading chat history...
              </div>
            ) : null}

            <ChatTimeline timeline={processedTimeline} activeRunningToolKey={activeRunningToolKey} />
            {compactingRunId ? (
              <div className="py-2">
                <ChatTimelineThinkingIndicator label="Compacting conversation" />
              </div>
            ) : null}
            {activeRunId && !compactingRunId && !hasRecentTextStream && runningTools === 0 ? (
              <div className="py-2">
                <ChatTimelineThinkingIndicator label="Thinking" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
          <div className="h-8 bg-gradient-to-t from-white via-white/80 to-transparent" />
          <div className="bg-white px-6 pb-8 pointer-events-auto">
            <div className="mx-auto w-full max-w-3xl">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleAttachmentFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <div className="group relative rounded-[32px] border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 focus-within:border-gray-400 focus-within:shadow-md">
                {attachments.length > 0 ? (
                  <div className="relative z-10 mb-2 flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 py-1 pl-2 pr-1 text-xs font-medium text-gray-900"
                      >
                        <img src={att.dataUrl} alt="" className="h-5 w-5 rounded object-cover" />
                        <span className="max-w-[120px] truncate">{att.name}</span>
                        <button
                          type="button"
                          className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
                          onClick={() => {
                            setAttachments((prev) => prev.filter((p) => p.id !== att.id));
                          }}
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  disabled={!connected || sending}
                  placeholder={
                    connected ? "Ask for follow-up changes..." : "Connect to gateway to chat..."
                  }
                  className="relative z-10 min-h-[44px] max-h-[200px] w-full resize-none border-none bg-transparent px-1 pr-14 text-base font-normal text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-400"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData.items;
                    void handleAttachmentFiles(items as unknown as FileList);
                  }}
                />

                {activeRunId ? (
                  <button
                    type="button"
                    className="absolute right-3 bottom-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[#17152F] text-white shadow-[0_8px_18px_rgba(23,21,47,0.18)] transition-transform duration-150 hover:scale-[1.02] active:scale-95"
                    onClick={handleAbort}
                    aria-label="Stop"
                  >
                    <StopIcon />
                  </button>
                ) : null}

                <div className="mt-1 flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                    >
                      <PaperclipIcon />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={sending || Boolean(activeRunId)}
                      onClick={() => {
                        void handleNewChannel();
                      }}
                      >
                      New channel
                    </button>
                  </div>

                  {activeRunId ? (
                    <div className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      className={`flex h-7 w-7 items-center justify-center rounded-lg shadow-sm transition-all active:scale-95 ${
                        connected && !sending && (draft.trim() || attachments.length > 0)
                          ? "bg-text-main text-white hover:bg-text-main/90 hover:shadow-md"
                          : "cursor-not-allowed bg-gray-100 text-gray-300"
                      }`}
                      disabled={!connected || sending || (!draft.trim() && attachments.length === 0)}
                      onClick={() => {
                        void handleSend();
                      }}
                    >
                      <ArrowUpIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
