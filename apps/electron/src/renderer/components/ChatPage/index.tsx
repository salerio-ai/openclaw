import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Check,
  File,
  Folder,
  Image,
  Paperclip,
  Stop,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { listWorkspaceSummaries } from "../../lib/bustly-supabase";
import { GatewayBrowserClient, type GatewayEventFrame } from "../../lib/gateway-client";
import {
  deriveScenarioLabel,
  resolveSessionIconComponent,
} from "../../lib/session-icons";
import { buildBustlyWorkspaceMainSessionKey } from "../../../shared/bustly-agent";
import { extractText, extractThinking } from "../../lib/chat-extract";
import Skeleton from "../ui/Skeleton";
import { ChatTimeline, ChatTimelineWaitingIndicator } from "./ChatTimeline";
import {
  buildInputArtifactsMessage,
  inferInputArtifactKind,
  type ChatInputArtifact,
  type InputArtifactKind,
} from "./input-artifacts";
import { collapseProcessedTurn, collapseStreamingEvents, resolveToolDisplay, formatToolDetail } from "./utils";
import type { TimelineArtifact, TimelineNode } from "./types";
import { useAppState } from "../../providers/AppStateProvider";

type ChatRole = "user" | "assistant" | "thinking" | "system";

type Attachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
  name: string;
};

type ContextPath = {
  id: string;
  path: string;
  name: string;
  kind: InputArtifactKind;
  imageUrl?: string;
};

type TextItem = {
  kind: "text";
  id: string;
  sortSeq: number;
  timestamp: number;
  role: ChatRole;
  text: string;
  artifacts?: TimelineArtifact[];
  runId?: string;
  streaming?: boolean;
  final?: boolean;
};

type ToolStatus = "running" | "completed" | "error";

type ToolItem = {
  kind: "tool";
  id: string;
  toolCallId: string;
  runId?: string;
  sortSeq: number;
  timestamp: number;
  name: string;
  args: unknown;
  output?: string;
  status: ToolStatus;
};

type ErrorItem = {
  kind: "error";
  id: string;
  sortSeq: number;
  timestamp: number;
  reason: string;
  description: string;
  runId?: string;
};

type TimelineItem = TextItem | ToolItem | ErrorItem;

type SessionUsageSummary = {
  totalTokens: number | null;
  contextTokens: number | null;
  remainingTokens: number | null;
};

type RunTerminalState = "final" | "aborted" | "error";
type ConnectionNoticeTone = "warning" | "error";
type ReconnectStatus = {
  runId: string;
};

const TOOL_RUNNING_MIN_VISIBLE_MS = 600;
const SIDEBAR_TASKS_REFRESH_EVENT = "openclaw:sidebar-refresh-tasks";
const CHAT_MODEL_LEVEL_STORAGE_KEY = "bustly.chat.model-level.v1";

const CHAT_MODEL_LEVELS = [
  { id: "lite", modelRef: "bustly/chat.lite", label: "Bustly Lite", description: "Fast & efficient for daily tasks." },
  { id: "pro", modelRef: "bustly/chat.pro", label: "Bustly Pro", description: "Balanced performance for complex reasoning." },
  { id: "max", modelRef: "bustly/chat.max", label: "Bustly Max", description: "Frontier intelligence for critical challenges." },
] as const;
const PREVIEW_ZOOM_STEPS = [0.5, 0.67, 0.8, 1] as const;
const PREVIEW_ZOOM_WHEEL_THRESHOLD = 45;
const PREVIEW_ZOOM_STEP_THROTTLE_MS = 45;

type ChatModelLevelId = (typeof CHAT_MODEL_LEVELS)[number]["id"];

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function notifySidebarTasksRefresh() {
  window.dispatchEvent(new Event(SIDEBAR_TASKS_REFRESH_EVENT));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function sessionAccentClasses(sessionKey: string) {
  const palette = [
    "bg-[#E8F1FF] text-[#2E5AAC]",
    "bg-[#EFF7EA] text-[#3E7D3C]",
    "bg-[#FFF1E6] text-[#A55B1F]",
    "bg-[#F4ECFF] text-[#6B46A6]",
    "bg-[#FDECEF] text-[#B43C59]",
  ] as const;
  return palette[hashString(sessionKey) % palette.length] ?? palette[0];
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

function resolvePreviewMinZoom(viewportWidth: number, viewportHeight: number, imageWidth: number, imageHeight: number): number {
  if (viewportWidth <= 0 || viewportHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return PREVIEW_ZOOM_STEPS[0];
  }
  const fullWidthHeight = viewportWidth * (imageHeight / imageWidth);
  if (fullWidthHeight <= 0) {
    return PREVIEW_ZOOM_STEPS[0];
  }
  return Math.min(1, viewportHeight / fullWidthHeight);
}

function resolvePreviewZoomChoices(minZoom: number): number[] {
  return Array.from(new Set([Number(minZoom.toFixed(3)), ...PREVIEW_ZOOM_STEPS.filter((step) => step > minZoom + 0.001)])).sort((a, b) => a - b);
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
  if (payload.stream !== "lifecycle") {
    return null;
  }
  if (payload.data?.phase !== "end") {
    return null;
  }
  return payload.data?.aborted === true ? "aborted" : "final";
}

function describeExecutionError(reason: string): string {
  const normalized = reason.trim().toLowerCase();
  if (normalized.includes("connection")) {
    return "The gateway connection was interrupted before execution could complete. Retry the request after the connection recovers.";
  }
  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "The upstream model temporarily rejected the request due to rate limiting. Retry in a moment or switch to a different model tier.";
  }
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("401") ||
    normalized.includes("forbidden") ||
    normalized.includes("403")
  ) {
    return "The current provider credentials were rejected. Refresh the provider auth and retry the request.";
  }
  return "Execution stopped before the agent could finish this run. Retry the request or check the gateway connection and model availability.";
}

function extractAgentErrorReason(payload: {
  stream?: string;
  data?: Record<string, unknown>;
}): string {
  const data = payload.data ?? {};
  const errorMessage =
    typeof data.error === "string"
      ? data.error
      : typeof data.message === "string"
        ? data.message
        : typeof data.reason === "string"
          ? data.reason
          : typeof data.stopReason === "string"
            ? data.stopReason
            : "";
  if (errorMessage.trim()) {
    return errorMessage.trim();
  }
  if (payload.stream === "error") {
    return "Execution error.";
  }
  return "Connection error.";
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

function looksLikeImagePath(pathOrName: string | undefined): boolean {
  return /\.(avif|bmp|gif|heic|jpeg|jpg|png|svg|tiff|webp)$/i.test(pathOrName ?? "");
}

async function resolvePastedSelection(params: {
  file?: File;
  entryPath?: string;
  entryName?: string;
  fallbackKind: "file" | "directory";
}): Promise<{ path: string; kind: "file" | "directory" }> {
  if (typeof window.electronAPI?.resolvePastedPath !== "function") {
    return { path: params.entryPath?.trim() ?? "", kind: params.fallbackKind };
  }
  try {
    const resolved = await window.electronAPI.resolvePastedPath(params);
    return {
      path: resolved?.path?.trim() ?? params.entryPath?.trim() ?? "",
      kind: resolved?.kind === "directory" || resolved?.kind === "file" ? resolved.kind : params.fallbackKind,
    };
  } catch {
    return { path: params.entryPath?.trim() ?? "", kind: params.fallbackKind };
  }
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
  const roleValue = (message as Record<string, unknown>).role;
  const role = typeof roleValue === "string" ? roleValue.toLowerCase() : "";
  if (role === "user") {
    return "user";
  }
  if (role === "system") {
    return "system";
  }
  return "assistant";
}

function isCompactionSystemMessage(message: unknown, text: string | null): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const rec = message as Record<string, unknown>;
  const role = typeof rec.role === "string" ? rec.role.toLowerCase() : "";
  if (role !== "system") {
    return false;
  }
  const meta =
    rec.__openclaw && typeof rec.__openclaw === "object"
      ? (rec.__openclaw as Record<string, unknown>)
      : null;
  const kind = typeof meta?.kind === "string" ? meta.kind.toLowerCase() : "";
  if (kind === "compaction") {
    return true;
  }
  return text?.trim() === "Compaction";
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

function InputArtifactCard({
  kind,
  title,
  subtitle,
  imageUrl,
  onPreview,
  onRemove,
}: {
  kind: InputArtifactKind;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  onPreview?: () => void;
  onRemove: () => void;
}) {
  const Icon = kind === "directory" ? Folder : kind === "image" ? Image : File;

  return (
    <div
      className="group/input flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 py-1 pr-1 pl-2 text-xs font-medium text-text-main"
      title={subtitle ?? title}
    >
      {imageUrl ? (
        <button type="button" className="h-5 w-5 shrink-0 overflow-hidden rounded-md border border-gray-200" onClick={onPreview}>
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center text-text-sub">
          <Icon size={16} weight="bold" />
        </div>
      )}
      <div className="min-w-0 max-w-[220px] truncate">{title}</div>
      <button
        type="button"
        className="rounded text-text-sub transition-colors hover:bg-gray-200 hover:text-text-main"
        onClick={onRemove}
        aria-label={`Remove ${title}`}
      >
        <X size={12} weight="bold" />
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { ensureGatewayReady, gatewayReady } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [contextPaths, setContextPaths] = useState<ContextPath[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<{
    message: string;
    tone: ConnectionNoticeTone;
  } | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [compactingRunId, setCompactingRunId] = useState<string | null>(null);
  const [reconnectStatus, setReconnectStatus] = useState<ReconnectStatus | null>(null);
  const [sessionUsage, setSessionUsage] = useState<SessionUsageSummary>({
    totalTokens: null,
    contextTokens: null,
    remainingTokens: null,
  });
  const [modelLevelOpen, setModelLevelOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [composerAreaHeight, setComposerAreaHeight] = useState(176);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(0.67);
  const [previewMinZoom, setPreviewMinZoom] = useState(0.67);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
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
    return "lite";
  });

  const clientRef = useRef<GatewayBrowserClient | null>(null);
  const seqCounterRef = useRef(1_000_000_000);
  const toolTimersRef = useRef<Map<string, number>>(new Map());
  const runSeqBaseRef = useRef<Map<string, number>>(new Map());
  const settledRunIdsRef = useRef<Set<string>>(new Set());
  const discardedRunIdsRef = useRef<Set<string>>(new Set());
  const retryPayloadsRef = useRef<Map<string, { draft: string; attachments: Attachment[]; contextPaths: ContextPath[] }>>(new Map());
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const previewWheelDeltaRef = useRef(0);
  const previewWheelLastStepAtRef = useRef(0);
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
  const composerAreaRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [currentScenarioIconId, setCurrentScenarioIconId] = useState<string | null>(null);
  const currentSessionKey = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("session") ?? buildBustlyWorkspaceMainSessionKey(activeWorkspaceId);
  }, [activeWorkspaceId, location.search]);
  const currentScenarioLabel = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return deriveScenarioLabel(currentSessionKey, searchParams.get("label"));
  }, [currentSessionKey, location.search]);
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    setCurrentScenarioIconId(searchParams.get("icon"));
  }, [location.search]);
  useEffect(() => {
    setPreviewZoom(0.67);
    setPreviewMinZoom(0.67);
    previewWheelDeltaRef.current = 0;
    previewWheelLastStepAtRef.current = 0;
  }, [previewImage]);
  useEffect(() => {
    if (!previewImage) {
      return undefined;
    }
    const updatePreviewBounds = () => {
      const viewport = previewViewportRef.current;
      const image = previewImageRef.current;
      if (!viewport || !image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return;
      }
      const minZoom = resolvePreviewMinZoom(
        viewport.clientWidth,
        viewport.clientHeight,
        image.naturalWidth,
        image.naturalHeight,
      );
      setPreviewMinZoom(minZoom);
      setPreviewZoom((value) => Math.max(minZoom, Math.min(1, value)));
    };
    updatePreviewBounds();
    window.addEventListener("resize", updatePreviewBounds);
    return () => {
      window.removeEventListener("resize", updatePreviewBounds);
    };
  }, [previewImage]);
  const CurrentScenarioIcon = useMemo(
    () =>
      resolveSessionIconComponent({
        icon: currentScenarioIconId,
        label: currentScenarioLabel,
        sessionKey: currentSessionKey,
      }),
    [currentScenarioIconId, currentScenarioLabel, currentSessionKey],
  );

  const loadGatewayStatus = useCallback(async () => {
    const status = await window.electronAPI.gatewayStatus();
    return status;
  }, []);

  const loadSessionUsage = useCallback(async (client: GatewayBrowserClient, sessionKey: string) => {
    const res = await client.request<{
      defaults?: { contextTokens?: number | null };
      sessions?: Array<{
        key: string;
        icon?: string;
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
    setCurrentScenarioIconId(typeof row?.icon === "string" ? row.icon : null);
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
    artifacts?: TimelineArtifact[];
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
          artifacts: params.artifacts,
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
        artifacts: params.artifacts ?? current.artifacts,
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

  const settleToolsForRun = useCallback((runId: string | null, status: ToolStatus) => {
    if (!runId) {
      return;
    }
    setTimeline((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.kind !== "tool" || item.runId !== runId || item.status !== "running") {
          return item;
        }
        changed = true;
        return { ...item, status };
      });
      return changed ? next : prev;
    });
  }, []);

  const finalizeRunState = useCallback((runId: string | null, toolStatus: ToolStatus = "completed") => {
    markRunFinished(runId);
    settleToolsForRun(runId, toolStatus);
    setActiveRunId((prev) => (prev === runId ? null : prev));
    setCompactingRunId((prev) => (prev === runId ? null : prev));
    if (runId) {
      settledRunIdsRef.current.add(runId);
      runSeqBaseRef.current.delete(runId);
    }
    streamSegmentsRef.current.delete(runId ?? "__unknown__");
  }, [markRunFinished, settleToolsForRun]);

  const upsertRunError = useCallback((params: {
    runId?: string;
    seq: number;
    timestamp: number;
    reason: string;
    description?: string;
  }) => {
    const key = params.runId ? `run:${params.runId}:error` : nextId("run-error");
    const reason = params.reason.trim() || "Execution error.";
    const description = params.description?.trim() || describeExecutionError(reason);
    setTimeline((prev) => {
      const idx = prev.findIndex((item) => item.kind === "error" && item.id === key);
      if (idx === -1) {
        const next: ErrorItem = {
          kind: "error",
          id: key,
          sortSeq: params.seq,
          timestamp: params.timestamp,
          reason,
          description,
          runId: params.runId,
        };
        return [...prev, next].toSorted(compareTimeline);
      }
      const current = prev[idx] as ErrorItem;
      if (current.reason === reason && current.description === description) {
        return prev;
      }
      const next = [...prev];
      next[idx] = {
        ...current,
        sortSeq: Math.min(current.sortSeq, params.seq),
        timestamp: params.timestamp,
        reason,
        description,
      };
      return next;
    });
  }, []);

  const removeRunError = useCallback((runId: string | null | undefined) => {
    if (!runId) {
      return;
    }
    const errorKey = `run:${runId}:error`;
    setTimeline((prev) => {
      const next = prev.filter((item) => item.id !== errorKey);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const clearReconnectStatus = useCallback((runId?: string | null) => {
    setReconnectStatus((prev) => {
      if (!prev) {
        return prev;
      }
      if (runId && prev.runId !== runId) {
        return prev;
      }
      return null;
    });
  }, []);

  const upsertTool = useCallback((params: {
    runId?: string;
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
          runId: params.runId,
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
        runId: params.runId ?? current.runId,
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
    setContextPaths([]);
    setActiveRunId(null);
    setCompactingRunId(null);
    setSessionUsage({
      totalTokens: null,
      contextTokens: null,
      remainingTokens: null,
    });
    setError(null);
    setConnectionNotice(null);
    setReconnectStatus(null);
    seqCounterRef.current = 1_000_000_000;
    streamSegmentsRef.current.clear();
    runSeqBaseRef.current.clear();
    settledRunIdsRef.current.clear();
    discardedRunIdsRef.current.clear();
    retryPayloadsRef.current.clear();
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
      if (isCompactionSystemMessage(message, text)) {
        continue;
      }
      if (text) {
        const textRole: ChatRole =
          role === "user"
            ? "user"
            : role === "assistant"
              ? "assistant"
              : role === "system"
                ? "system"
                : "assistant";
        if (textRole === "user") {
          console.log("[electron-chat] history user message", {
            sessionKey,
            timestamp,
            message,
            text,
          });
        }
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
        const toolStatus: ToolStatus = tool.output
          ? "completed"
          : stopReason === "aborted" || stopReason === "error"
            ? "error"
            : "running";
        const existing = toolsByCallId.get(tool.toolCallId);
        if (!existing) {
          toolsByCallId.set(tool.toolCallId, {
            kind: "tool",
            id: `tool:${tool.toolCallId}`,
            toolCallId: tool.toolCallId,
            runId: undefined,
            sortSeq: baseSeq + 0.02,
            timestamp,
            name: tool.name,
            args: tool.args,
            output: tool.output,
            status: toolStatus,
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
          status:
            tool.output
              ? "completed"
              : existing.status === "running"
                ? toolStatus
                : existing.status,
        });
      }
    }

    items.push(...toolsByCallId.values());
    setTimeline((prev) => {
      const localErrors = prev.filter((item): item is ErrorItem => item.kind === "error");
      const merged = [...items, ...localErrors];
      return merged.toSorted(compareTimeline);
    });
  }, []);

  const connectGateway = useCallback(
    async (status: GatewayStatus) => {
      if (!status.running) {
        setConnected(false);
        setConnectionNotice({
          message: "Gateway unavailable. Reconnecting...",
          tone: "warning",
        });
        return;
      }
      setConnectionNotice(null);
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
          setConnectionNotice(null);
          void loadHistory(client, currentSessionKey).catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          });
          void loadSessionUsage(client, currentSessionKey).catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        },
        onClose: ({ code, reason, error: closeError }) => {
          setConnected(false);
          if (closeError) {
            setConnectionNotice(null);
            setError(closeError.message);
          } else {
            setError(null);
            setConnectionNotice({
              message: "Gateway disconnected. Reconnecting...",
              tone: "warning",
            });
          }
          console.warn("[electron-chat] gateway disconnected", {
            code,
            reason: reason || "no reason",
            error: closeError,
          });
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
            if (runId && discardedRunIdsRef.current.has(runId)) {
              return;
            }
            if (runId && settledRunIdsRef.current.has(runId) && payload.state !== "final" && payload.state !== "aborted" && payload.state !== "error") {
              return;
            }
            const terminalState = resolveChatTerminalState(payload);
            if (payload.state === "delta") {
              return;
            }
            if (terminalState === "final") {
              finalizeRunState(runId, "completed");
              clearReconnectStatus(runId);
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
              finalizeRunState(runId, "error");
              clearReconnectStatus(runId);
              if (terminalState === "error") {
                upsertRunError({
                  runId: runId ?? undefined,
                  seq: seqCounterRef.current++,
                  timestamp: Date.now(),
                  reason: payload.errorMessage ?? "Execution error.",
                });
              }
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
            if (runId && discardedRunIdsRef.current.has(runId)) {
              return;
            }
            if (runId && settledRunIdsRef.current.has(runId) && payload.stream !== "lifecycle" && payload.stream !== "error") {
              return;
            }
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

            if (runId && (stream === "assistant" || stream === "thinking" || stream === "tool")) {
              clearReconnectStatus(runId);
            }

            if (stream === "lifecycle" && data.phase === "reconnecting" && runId) {
              setReconnectStatus({
                runId,
              });
              return;
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
                runId: runId ?? undefined,
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

            if (stream === "error") {
              return;
            }

            const terminalState = resolveAgentTerminalState({ stream, data });
            if (terminalState) {
              finalizeRunState(runId, terminalState === "final" ? "completed" : "error");
              if (terminalState === "aborted" && runId) {
                discardedRunIdsRef.current.add(runId);
              }
              if (terminalState === "final") {
                markLastAssistantAsFinal(runId);
              }
              refreshSessionUsage(client, currentSessionKey);
              notifySidebarTasksRefresh();
              return;
            }

            if (stream === "lifecycle" && data.phase === "error") {
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
      clearReconnectStatus,
      upsertRunError,
      upsertTool,
      ensureGatewayReady,
    ],
  );

  useEffect(() => {
    let disposed = false;

    const loadWorkspaceState = async () => {
      try {
        const summary = await listWorkspaceSummaries();
        if (disposed) {
          return;
        }
        const workspaceId = summary.activeWorkspaceId || summary.workspaces[0]?.id || "";
        const activeWorkspace = summary.workspaces.find((entry) => entry.id === workspaceId);
        setActiveWorkspaceId(workspaceId);
        setSubscriptionExpired(activeWorkspace?.expired === true);
      } catch {
        if (!disposed) {
          setActiveWorkspaceId("");
          setSubscriptionExpired(false);
        }
      }
    };

    void loadWorkspaceState();
    const unsubscribe = window.electronAPI.onBustlyLoginRefresh(() => {
      void loadWorkspaceState();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!gatewayReady) {
      setConnected(false);
      setLoading(true);
      setConnectionNotice({
        message: "Waiting for gateway...",
        tone: "warning",
      });
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
          if (!status.running) {
            setConnected(false);
            setConnectionNotice({
              message: "Gateway unavailable. Reconnecting...",
              tone: "warning",
            });
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
  }, [connectGateway, ensureGatewayReady, gatewayReady, loadGatewayStatus]);

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
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      const isNotAtBottom = distanceFromBottom > 100;
      const isOverOnePage = element.scrollHeight > element.clientHeight;
      shouldStickToBottomRef.current = !isNotAtBottom;
      setShowScrollBottom(isNotAtBottom && isOverOnePage);
    };
    handleScroll();
    element.addEventListener("scroll", handleScroll);
    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
    shouldStickToBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }
    scrollToBottom("auto");
  }, [scrollToBottom, timeline]);

  useEffect(() => {
    const element = composerAreaRef.current;
    if (!element) {
      return;
    }
    const updateComposerAreaHeight = () => {
      setComposerAreaHeight(element.offsetHeight);
      if (shouldStickToBottomRef.current) {
        window.requestAnimationFrame(() => {
          scrollToBottom("auto");
        });
      }
    };
    updateComposerAreaHeight();
    const observer = new ResizeObserver(() => {
      updateComposerAreaHeight();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [draft]);

  const sendChatMessage = useCallback(async () => {
    const msg = draft.trim();
    if (
      subscriptionExpired ||
      !connected ||
      (!msg && attachments.length === 0 && contextPaths.length === 0) ||
      sending ||
      !clientRef.current
    ) {
      return;
    }
    const selectedModelRef =
      (CHAT_MODEL_LEVELS.find((entry) => entry.id === modelLevel) ?? CHAT_MODEL_LEVELS[0]).modelRef;
    const patchModelResult = await window.electronAPI.gatewayPatchSessionModel(currentSessionKey, selectedModelRef);
    if (!patchModelResult.success) {
      setError(patchModelResult.error ?? "Failed to apply model selection.");
      return;
    }
    const outgoingArtifacts: ChatInputArtifact[] = [
      ...attachments.map((attachment) => ({
        kind: "image" as const,
        name: attachment.name,
      })),
      ...contextPaths.map((entry) => ({
        kind: entry.kind,
        name: entry.name,
        path: entry.path,
      })),
    ];
    const timelineArtifacts: TimelineArtifact[] = [
      ...attachments.map((attachment) => ({
        kind: "image" as const,
        name: attachment.name,
        imageUrl: attachment.dataUrl,
      })),
      ...contextPaths.map((entry) => ({
        kind: entry.kind,
        name: entry.name,
        path: entry.path,
      })),
    ];
    const outgoingMessage = buildInputArtifactsMessage(draft, outgoingArtifacts);

    const localSeq = seqCounterRef.current++;
    const userItem: TextItem = {
      kind: "text",
      id: nextId("user"),
      sortSeq: localSeq,
      timestamp: Date.now(),
      role: "user",
      text: outgoingMessage,
      artifacts: timelineArtifacts,
      streaming: false,
    };
    console.log("[electron-chat] local user message", {
      sessionKey: currentSessionKey,
      outgoingMessage,
      timelineArtifacts,
      outgoingArtifacts,
    });
    setTimeline((prev) => [...prev, userItem].sort(compareTimeline));
    setDraft("");
    setAttachments([]);
    setContextPaths([]);
    setSending(true);
    setError(null);

    const idempotencyKey = nextId("run");
    retryPayloadsRef.current.set(idempotencyKey, {
      draft: msg,
      attachments: attachments.map((attachment) => ({ ...attachment })),
      contextPaths: contextPaths.map((entry) => ({ ...entry })),
    });
    settledRunIdsRef.current.delete(idempotencyKey);
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
        message: outgoingMessage,
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
  }, [attachments, connected, contextPaths, currentSessionKey, draft, modelLevel, sending, subscriptionExpired]);

  const handleSend = useCallback(async () => {
    await sendChatMessage();
  }, [sendChatMessage]);

  const handleRetryRun = useCallback(async (runId?: string) => {
    const retryPayload =
      (runId ? retryPayloadsRef.current.get(runId) : undefined) ??
      Array.from(retryPayloadsRef.current.values()).at(-1);
    const retryRunId =
      runId ??
      Array.from(retryPayloadsRef.current.keys()).at(-1);
    if (!retryPayload || !retryRunId || !clientRef.current || !connected || subscriptionExpired || sending) {
      return;
    }
    const selectedModelRef =
      (CHAT_MODEL_LEVELS.find((entry) => entry.id === modelLevel) ?? CHAT_MODEL_LEVELS[0]).modelRef;
    const patchModelResult = await window.electronAPI.gatewayPatchSessionModel(currentSessionKey, selectedModelRef);
    if (!patchModelResult.success) {
      setError(patchModelResult.error ?? "Failed to apply model selection.");
      return;
    }
    const outgoingArtifacts: ChatInputArtifact[] = [
      ...retryPayload.attachments.map((attachment) => ({
        kind: "image" as const,
        name: attachment.name,
      })),
      ...retryPayload.contextPaths.map((entry) => ({
        kind: entry.kind,
        name: entry.name,
        path: entry.path,
      })),
    ];
    const outgoingMessage = buildInputArtifactsMessage(retryPayload.draft, outgoingArtifacts);
    const apiAttachments = retryPayload.attachments
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

    clearReconnectStatus(retryRunId);
    removeRunError(retryRunId);
    discardedRunIdsRef.current.delete(retryRunId);
    settledRunIdsRef.current.delete(retryRunId);
    setActiveRunId(retryRunId);
    setCompactingRunId(null);
    setSending(true);
    setError(null);
    try {
      await clientRef.current.request("chat.retry", {
        sessionKey: currentSessionKey,
        runId: retryRunId,
        message: outgoingMessage,
        deliver: false,
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
  }, [clearReconnectStatus, connected, currentSessionKey, modelLevel, removeRunError, sending, subscriptionExpired]);

  const handleAbort = useCallback(async () => {
    const client = clientRef.current;
    const runId = activeRunId;

    // Abort must clear the local running state immediately so the UI cannot get stuck
    // behind an RPC response that is delayed, missing runIds, or races with reconnects.
    setSending(false);
    setActiveRunId(null);
    setCompactingRunId(null);
    clearReconnectStatus(runId);
    if (runId) {
      discardedRunIdsRef.current.add(runId);
      finalizeRunState(runId, "error");
    }

    if (!connected || !client) {
      return;
    }

    try {
      const res = await client.request<{ aborted?: boolean; runIds?: string[] }>("chat.abort", {
        sessionKey: currentSessionKey,
        runId: runId ?? undefined,
      });
      let abortedRunIds = Array.isArray(res.runIds)
        ? res.runIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        : runId
          ? [runId]
          : [];

      if ((!res.aborted || abortedRunIds.length === 0) && currentSessionKey) {
        const fallbackRes = await client.request<{ aborted?: boolean; runIds?: string[] }>("chat.abort", {
          sessionKey: currentSessionKey,
        });
        const fallbackRunIds = Array.isArray(fallbackRes.runIds)
          ? fallbackRes.runIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          : [];
        if (fallbackRunIds.length > 0) {
          abortedRunIds = fallbackRunIds;
        }
      }

      for (const abortedRunId of abortedRunIds) {
        discardedRunIdsRef.current.add(abortedRunId);
        finalizeRunState(abortedRunId, "error");
      }
      refreshSessionUsage(client, currentSessionKey);
      notifySidebarTasksRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeRunId, clearReconnectStatus, connected, currentSessionKey, finalizeRunState, refreshSessionUsage]);

  const handleOpenPricing = useCallback(async () => {
    if (!activeWorkspaceId) {
      return;
    }
    await window.electronAPI.bustlyOpenWorkspaceManage(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const appendContextSelections = useCallback((selected: ChatContextPathSelection[]) => {
    if (selected.length > 0) {
      console.log("[electron-chat] context paths added", selected);
    }
    setContextPaths((prev) => {
      const seen = new Set(prev.map((entry) => entry.path));
      const nextEntries = selected
        .filter((entry): entry is ChatContextPathSelection => Boolean(entry?.path && entry?.name))
        .filter((entry) => {
          if (seen.has(entry.path)) {
            return false;
          }
          seen.add(entry.path);
          return true;
        })
        .map((entry) => ({
          id: nextId("ctx"),
          path: entry.path,
          name: entry.name,
          kind: inferInputArtifactKind(entry),
          imageUrl: entry.imageUrl,
        }));
      return nextEntries.length > 0 ? [...prev, ...nextEntries] : prev;
    });
  }, []);

  const handleAttachmentFiles = useCallback(async (
    input: FileList | DataTransferItemList | null,
    clipboardData?: DataTransfer | null,
  ) => {
    if (subscriptionExpired || !input || input.length === 0) {
      return;
    }
    const inputEntries = Array.from({ length: input.length }, (_, index) => input[index]).filter(
      (entry): entry is File | DataTransferItem => Boolean(entry),
    );
    const hasFileLikeEntry = inputEntries.some((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if ("kind" in entry) {
        return typeof entry.kind === "string" && entry.kind === "file";
      }
      return "name" in entry && "type" in entry;
    });
    if (!hasFileLikeEntry) {
      return;
    }

    const contextSelections: ChatContextPathSelection[] = [];
    const files: File[] = [];
    for (const entry of inputEntries) {
      const directFile =
        entry &&
        typeof entry === "object" &&
        "type" in entry &&
        "name" in entry &&
        typeof (entry).type === "string" &&
        typeof (entry).name === "string"
          ? (entry)
          : null;
      if (directFile) {
        const resolvedSelection = await resolvePastedSelection({
          file: directFile,
          entryPath:
            "path" in directFile && typeof (directFile as File & { path?: unknown }).path === "string"
              ? String((directFile as File & { path?: string }).path)
              : undefined,
          entryName: directFile.name,
          fallbackKind: "file",
        });
        if (resolvedSelection.path) {
          contextSelections.push({
            path: resolvedSelection.path,
            name: directFile.name || resolvedSelection.path,
            kind: resolvedSelection.kind,
            imageUrl:
              resolvedSelection.kind === "file" &&
              (directFile.type.startsWith("image/") || looksLikeImagePath(resolvedSelection.path))
                ? await new Promise<string>((resolve, reject) => {
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
                    reader.readAsDataURL(directFile);
                  }).catch(() => undefined)
                : undefined,
          });
          continue;
        }
        files.push(directFile);
        continue;
      }
      const clipboardItem =
        entry &&
        typeof entry === "object" &&
        "kind" in entry &&
        "getAsFile" in entry &&
        typeof entry.getAsFile === "function"
          ? (entry as unknown as DataTransferItem)
          : null;
      const entryHandle =
        clipboardItem &&
        "webkitGetAsEntry" in clipboardItem &&
        typeof (clipboardItem as unknown as { webkitGetAsEntry?: () => { isDirectory?: boolean; fullPath?: string; name?: string } | null }).webkitGetAsEntry === "function"
          ? (clipboardItem as unknown as { webkitGetAsEntry: () => { isDirectory?: boolean; fullPath?: string; name?: string } | null }).webkitGetAsEntry()
          : null;
      if (entryHandle?.isDirectory && entryHandle.fullPath) {
        const resolvedSelection = await resolvePastedSelection({
          entryPath: entryHandle.fullPath,
          entryName: entryHandle.name,
          fallbackKind: "directory",
        });
        contextSelections.push({
          path: resolvedSelection.path || entryHandle.fullPath,
          name: entryHandle.name || resolvedSelection.path || entryHandle.fullPath,
          kind: resolvedSelection.kind,
        });
        continue;
      }
      if (!clipboardItem || clipboardItem.kind !== "file") {
        continue;
      }
      const file = clipboardItem.getAsFile();
      if (file) {
        const resolvedSelection = await resolvePastedSelection({
          file,
          entryPath:
            "path" in file && typeof (file as File & { path?: unknown }).path === "string"
              ? String((file as File & { path?: string }).path)
              : undefined,
          entryName: file.name,
          fallbackKind: "file",
        });
        if (resolvedSelection.path) {
          contextSelections.push({
            path: resolvedSelection.path,
            name: file.name || resolvedSelection.path,
            kind: resolvedSelection.kind,
            imageUrl:
              resolvedSelection.kind === "file" &&
              (file.type.startsWith("image/") || looksLikeImagePath(resolvedSelection.path))
                ? await new Promise<string>((resolve, reject) => {
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
                  }).catch(() => undefined)
                : undefined,
          });
          continue;
        }
        files.push(file);
      }
    }
    if (contextSelections.length > 0) {
      console.log("[electron-chat] pasted context selections", contextSelections);
      appendContextSelections(contextSelections);
    }
    if (files.length === 0) {
      return;
    }
    const next: Attachment[] = [];
    for (const file of files) {
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
      console.log(
        "[electron-chat] image attachments added",
        next.map((entry) => ({ name: entry.name, mimeType: entry.mimeType })),
      );
      setAttachments((prev) => [...prev, ...next]);
    }
  }, [appendContextSelections, subscriptionExpired]);

  const handleSelectContextPaths = useCallback(async () => {
    if (subscriptionExpired) {
      return;
    }
    try {
      const selected = await window.electronAPI.selectChatContextPaths();
      if (!Array.isArray(selected) || selected.length === 0) {
        return;
      }
      appendContextSelections(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [appendContextSelections, subscriptionExpired]);

  const runningTools = useMemo(
    () =>
      activeRunId
        ? timeline.filter(
            (item) =>
              item.kind === "tool" &&
              item.status === "running" &&
              item.runId === activeRunId,
          ).length
        : 0,
    [activeRunId, timeline],
  );

  const activeRunningToolId = useMemo(() => {
    let latest: ToolItem | null = null;
    for (const entry of timeline) {
      if (
        entry.kind !== "tool" ||
        entry.status !== "running" ||
        !activeRunId ||
        entry.runId !== activeRunId
      ) {
        continue;
      }
      if (!latest || entry.sortSeq > latest.sortSeq) {
        latest = entry;
      }
    }
    return latest?.id ?? null;
  }, [activeRunId, timeline]);

  const processedTimeline = useMemo(() => {
    const rawNodes: TimelineNode[] = timeline.map((item) => {
      if (item.kind === "text") {
        return {
          kind: "text",
          key: item.id,
          timestamp: item.timestamp,
          text: item.text,
          artifacts: item.artifacts,
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
      if (item.kind === "error") {
        return {
          kind: "errorState",
          key: item.id,
          timestamp: item.timestamp,
          reason: item.reason,
          description: item.description,
          runId: item.runId,
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
    return collapseStreamingEvents(collapseProcessedTurn(rawNodes), 5, Boolean(activeRunId || sending));
  }, [activeRunId, sending, timeline]);

  const activeRunningToolKey = activeRunningToolId ? activeRunningToolId : null;
  const contextUsageLabel = useMemo(() => {
    if (sessionUsage.contextTokens == null) {
      return "Context left: ?";
    }
    return `Context left: ${formatTokenCount(sessionUsage.remainingTokens)} / ${formatTokenCount(sessionUsage.contextTokens)}`;
  }, [sessionUsage.contextTokens, sessionUsage.remainingTokens]);
  const selectedModelLevel = useMemo(
    () => CHAT_MODEL_LEVELS.find((entry) => entry.id === modelLevel) ?? CHAT_MODEL_LEVELS[0],
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
      <div className="sticky top-0 z-20 flex h-14 flex-none items-center bg-white/80 backdrop-blur-sm [-webkit-app-region:drag]">
        <div className="flex w-full items-center px-6">
          <div className="relative [-webkit-app-region:no-drag]">
            <button
              ref={modelTriggerRef}
              type="button"
              onClick={() => setModelLevelOpen((prev) => !prev)}
              className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors ${
                modelLevelOpen
                  ? "bg-[#F5F5F5] text-gray-900"
                  : "text-gray-500 hover:bg-[#F5F5F5] hover:text-gray-900"
              }`}
            >
              <span className="text-lg font-semibold tracking-tight text-gray-900">{selectedModelLevel.label}</span>
              <CaretDown size={16} weight="bold" className={`text-gray-500 transition-transform ${modelLevelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {error || connectionNotice ? (
        <div
          className={`mx-auto mt-4 w-full max-w-3xl rounded-2xl px-4 py-3 text-sm ${
            error != null || connectionNotice?.tone === "error"
              ? "border border-red-100 bg-red-50 text-red-600"
              : "border border-amber-100 bg-amber-50 text-amber-700"
          }`}
        >
          {error ?? connectionNotice?.message}
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
                        <span className="text-sm font-medium">{option.label}</span>
                        {selected ? <Check size={16} weight="bold" className="text-[#1A162F]" /> : null}
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-8" style={{ paddingBottom: composerAreaHeight + 16 }}>
            {!loading && timeline.length === 0 ? (
              <div className="flex min-h-[52vh] flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#1A162F] shadow-lg shadow-[#1A162F]/5">
                  <CurrentScenarioIcon size={28} weight="bold" />
                </div>
                <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#1A162F]">
                  {currentScenarioLabel}
                </h1>
                <p className="max-w-[720px] text-base text-[#666F8D]">
                  {subscriptionExpired
                    ? "Renew your workspace plan to continue this workflow."
                    : "How can I help you today?"}
                </p>
              </div>
            ) : null}
            {loading ? (
              <div className="rounded-2xl border border-gray-100 bg-white px-5 py-5">
                <div className="space-y-4">
                  <div className="flex justify-start">
                    <div className="w-full max-w-[70%] space-y-2 rounded-3xl bg-[#F6F7F9] px-5 py-4">
                      <Skeleton className="h-4 w-28 rounded-md" />
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-3/4 rounded-md" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="w-full max-w-[62%] space-y-2 rounded-3xl bg-[#F6F7F9] px-5 py-4">
                      <Skeleton className="h-4 w-20 rounded-md" />
                      <Skeleton className="h-4 w-full rounded-md" />
                    </div>
                  </div>
                    <div className="flex justify-start">
                    <div className="w-full max-w-[76%] space-y-2 rounded-3xl bg-[#F6F7F9] px-5 py-4">
                      <Skeleton className="h-4 w-24 rounded-md" />
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-5/6 rounded-md" />
                      <Skeleton className="h-4 w-2/3 rounded-md" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <ChatTimeline
              timeline={processedTimeline}
              activeRunningToolKey={activeRunningToolKey}
              onRetryRun={handleRetryRun}
              onPreviewImage={setPreviewImage}
            />
            {compactingRunId ? (
              <div className="py-2">
                <ChatTimelineWaitingIndicator label="Compacting conversation" />
              </div>
            ) : reconnectStatus ? (
              <div className="py-2">
                <ChatTimelineWaitingIndicator
                  label="Reconnect"
                />
              </div>
            ) : (sending || activeRunId) && runningTools === 0 ? (
              <div className="py-2">
                <ChatTimelineWaitingIndicator label="Thinking" />
              </div>
            ) : null}
          </div>
        </div>

        {showScrollBottom ? (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="absolute left-1/2 z-30 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-text-main shadow-md transition-all duration-300 hover:border-gray-300 hover:bg-gray-50"
            style={{ bottom: composerAreaHeight + 16 }}
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={14} weight="bold" />
          </button>
        ) : null}

        <div ref={composerAreaRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
          <div className="h-8 bg-gradient-to-t from-white via-white/80 to-transparent" />
          <div className="border-t border-white/40 bg-white px-6 pb-8 pointer-events-auto">
            <div className="mx-auto w-full max-w-3xl">
              {subscriptionExpired ? (
                <div className="mb-3 rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-[0_10px_24px_rgba(26,22,47,0.05)]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#ECECEC] bg-white text-[#666F8D] shadow-sm">
                        <WarningCircle size={18} weight="bold" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-[#1A162F]">Your plan has expired</div>
                        <p className="text-sm text-[#666F8D]">
                          Renew to keep chatting with Bustly and continue follow-up tasks.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleOpenPricing();
                      }}
                      className="shrink-0 rounded-xl bg-[#1A162F] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#27223F]"
                    >
                      Renew plan
                    </button>
                  </div>
                </div>
              ) : null}

              <div
                className={`group relative rounded-[28px] border bg-white p-4 shadow-sm transition-all duration-300 ${
                  subscriptionExpired
                    ? "cursor-not-allowed border-[#ECECEC] bg-[#FAFAFA]"
                    : "border-gray-200 hover:border-gray-300 focus-within:border-gray-400 focus-within:shadow-md"
                }`}
              >
                {attachments.length > 0 || contextPaths.length > 0 ? (
                  <div className="relative z-10 mb-3 flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <InputArtifactCard
                        key={att.id}
                        kind="image"
                        title={att.name}
                        subtitle={att.mimeType}
                        imageUrl={att.dataUrl}
                        onPreview={() => {
                          setPreviewImage(att.dataUrl);
                        }}
                        onRemove={() => {
                          setPreviewImage(null);
                          setAttachments((prev) => prev.filter((p) => p.id !== att.id));
                        }}
                      />
                    ))}
                    {contextPaths.map((entry) => (
                      <InputArtifactCard
                        key={entry.id}
                        kind={entry.kind}
                        title={entry.name}
                        subtitle={entry.path}
                        imageUrl={entry.imageUrl}
                        onPreview={
                          entry.imageUrl
                            ? () => {
                                setPreviewImage(entry.imageUrl ?? null);
                              }
                            : undefined
                        }
                        onRemove={() => {
                          setContextPaths((prev) => prev.filter((p) => p.id !== entry.id));
                        }}
                      />
                    ))}
                  </div>
                ) : null}

                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  disabled={!connected || sending || subscriptionExpired}
                  placeholder={
                    subscriptionExpired
                      ? "Renew your plan to continue..."
                      : connected
                        ? "Ask for follow-up changes..."
                        : "Connect to gateway to chat..."
                  }
                  className="relative z-10 min-h-[44px] max-h-[200px] w-full resize-none border-none bg-transparent px-1 pr-14 text-base font-light text-text-main outline-none placeholder:text-text-sub/70 disabled:cursor-not-allowed disabled:text-[#8B93AA]"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  onPaste={(e) => {
                    const files = e.clipboardData.files;
                    const items = e.clipboardData.items;
                    const source = files && files.length > 0 ? files : items;
                    if (!source || source.length === 0) {
                      return;
                    }
                    void handleAttachmentFiles(source, e.clipboardData).catch((error) => {
                      console.error("[electron-chat] paste attachment handling failed", error);
                    });
                  }}
                />

                {activeRunId ? (
                  <button
                    type="button"
                    className="absolute right-3 bottom-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[#17152F] text-white shadow-[0_8px_18px_rgba(23,21,47,0.18)] transition-transform duration-150 hover:scale-[1.02] active:scale-95"
                    onClick={handleAbort}
                    aria-label="Stop"
                  >
                    <Stop size={14} weight="fill" />
                  </button>
                ) : null}

                <div className="mt-1 flex items-center justify-between pt-2">
                  <div className={`flex items-center gap-2 ${subscriptionExpired ? "pointer-events-none opacity-50" : ""}`}>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-sub transition-all duration-200 hover:bg-gray-100 hover:text-text-main active:bg-gray-200"
                      onClick={() => {
                        void handleSelectContextPaths();
                      }}
                      title="Add photos & files"
                    >
                      <Paperclip size={18} weight="bold" />
                    </button>
                  </div>

                  {activeRunId ? (
                    <div className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      className={`flex h-7 w-7 items-center justify-center rounded-lg shadow-sm transition-all active:scale-95 ${
                        connected &&
                        !subscriptionExpired &&
                        !sending &&
                        (draft.trim() || attachments.length > 0 || contextPaths.length > 0)
                          ? "bg-black text-white hover:bg-black/90 hover:shadow-md"
                          : "cursor-not-allowed bg-gray-100 text-gray-300"
                      }`}
                      disabled={
                        !connected ||
                        subscriptionExpired ||
                        sending ||
                        (!draft.trim() && attachments.length === 0 && contextPaths.length === 0)
                      }
                      onClick={() => {
                        void handleSend();
                      }}
                    >
                      <ArrowUp size={14} weight="bold" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewImage
        ? createPortal(
            <div
              className="fixed inset-0 z-[30000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm [-webkit-app-region:no-drag]"
              onClick={() => setPreviewImage(null)}
            >
              <button
                type="button"
                className="fixed top-6 right-6 z-[30010] cursor-pointer rounded-full bg-black/50 p-2 text-white transition-all hover:bg-black/70 [-webkit-app-region:no-drag]"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPreviewImage(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setPreviewImage(null);
                }}
              >
                <X size={20} weight="bold" />
              </button>
              <div
                className="relative flex w-full max-w-[90vw] flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  ref={previewViewportRef}
                  className="max-h-[90vh] overflow-y-auto overflow-x-hidden p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ msOverflowStyle: "none" }}
                  onWheel={(event) => {
                    if (!event.ctrlKey && !event.metaKey) {
                      return;
                    }
                    event.preventDefault();
                    if (event.deltaY === 0) {
                      return;
                    }
                    previewWheelDeltaRef.current += event.deltaY;
                    if (Math.abs(previewWheelDeltaRef.current) < PREVIEW_ZOOM_WHEEL_THRESHOLD) {
                      return;
                    }
                    const now = Date.now();
                    if (now - previewWheelLastStepAtRef.current < PREVIEW_ZOOM_STEP_THROTTLE_MS) {
                      return;
                    }
                    const direction = previewWheelDeltaRef.current < 0 ? "in" : "out";
                    previewWheelDeltaRef.current = 0;
                    previewWheelLastStepAtRef.current = now;
                    setPreviewZoom((value) => {
                      const zoomChoices = resolvePreviewZoomChoices(previewMinZoom);
                      if (direction === "in") {
                        return zoomChoices.find((step) => step > value + 0.001) ?? zoomChoices[zoomChoices.length - 1] ?? value;
                      }
                      for (let index = zoomChoices.length - 1; index >= 0; index -= 1) {
                        const step = zoomChoices[index];
                        if (step < value - 0.001) {
                          return step;
                        }
                      }
                      return zoomChoices[0] ?? value;
                    });
                  }}
                >
                  <img
                    ref={previewImageRef}
                    src={previewImage}
                    alt="Preview"
                    className="mx-auto block"
                    onLoad={() => {
                      const viewport = previewViewportRef.current;
                      const image = previewImageRef.current;
                      if (!viewport || !image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                        return;
                      }
                      const minZoom = resolvePreviewMinZoom(
                        viewport.clientWidth,
                        viewport.clientHeight,
                        image.naturalWidth,
                        image.naturalHeight,
                      );
                      setPreviewMinZoom(minZoom);
                      setPreviewZoom(minZoom);
                    }}
                    style={{
                      width: `${Math.round(previewZoom * 100)}%`,
                      maxWidth: "100%",
                      height: "auto",
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
