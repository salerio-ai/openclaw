import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GatewayBrowserClient, type GatewayEventFrame } from "../../lib/gateway-client";
import { extractText, extractThinking } from "../../lib/chat-extract";
import { ChatTimeline } from "./ChatTimeline";
import { collapseProcessedTurn, resolveToolDisplay, formatToolDetail } from "./utils";
import type { TimelineNode } from "./types";

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

const DEFAULT_SESSION_KEY = "agent:main:main";
const TOOL_RUNNING_MIN_VISIBLE_MS = 600;

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

export default function ChatPage() {
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamUpdatedAt, setStreamUpdatedAt] = useState<number | null>(null);

  const clientRef = useRef<GatewayBrowserClient | null>(null);
  const seqCounterRef = useRef(1_000_000_000);
  const toolTimersRef = useRef<Map<string, number>>(new Map());
  const runSeqBaseRef = useRef<Map<string, number>>(new Map());
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

  const loadGatewayStatus = useCallback(async () => {
    const status = await window.electronAPI.gatewayStatus();
    setGateway(status);
    return status;
  }, []);

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

  const loadHistory = useCallback(async (client: GatewayBrowserClient) => {
    const res = await client.request<{ messages?: unknown[] }>("chat.history", {
      sessionKey: DEFAULT_SESSION_KEY,
      limit: 200,
    });
    const history = Array.isArray(res.messages) ? res.messages : [];
    console.log("[electron-chat] chat.history loaded", { count: history.length, sessionKey: DEFAULT_SESSION_KEY });
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
    setTimeline((prev) => {
      if (prev.length === 0) {
        return items.toSorted(compareTimeline);
      }
      const merged = new Map<string, TimelineItem>();
      for (const item of items) {
        merged.set(item.id, item);
      }
      for (const item of prev) {
        merged.set(item.id, item);
      }
      return [...merged.values()].toSorted(compareTimeline);
    });
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
          void loadHistory(client).catch((err) => {
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
          if (evt.event === "agent") {
            const payload = evt.payload as {
              runId?: string;
              seq?: number;
              stream?: string;
              ts?: number;
              sessionKey?: string;
              data?: Record<string, unknown>;
            };
            if (!payload || payload.sessionKey !== DEFAULT_SESSION_KEY) {
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

            if (runId) {
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

            if (stream === "lifecycle") {
              const phase = typeof data.phase === "string" ? data.phase : "";
              if (phase === "end") {
                const aborted = data.aborted === true;
                markRunFinished(runId);
                if (!aborted) {
                  markLastAssistantAsFinal(runId);
                }
                setActiveRunId((prev) => (prev === runId ? null : prev));
                streamSegmentsRef.current.delete(runKey);
                if (runId) {
                  runSeqBaseRef.current.delete(runId);
                }
                if (aborted) {
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
              }
            }
            return;
          }

          if (evt.event === "chat") {
            // Realtime timeline is intentionally single-channel: only `agent` stream events.
            // `chat` frames are ignored here to prevent duplicate rendering.
            return;
          }
        },
      });
      clientRef.current?.stop();
      clientRef.current = client;
      client.start();
    },
    [appendOrUpdateText, loadHistory, markLastAssistantAsFinal, markRunFinished, upsertTool],
  );

  useEffect(() => {
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
  }, [connectGateway, loadGatewayStatus]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [timeline]);

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
        sessionKey: DEFAULT_SESSION_KEY,
        message: msg,
        deliver: false,
        idempotencyKey,
        attachments: apiAttachments.length > 0 ? apiAttachments : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActiveRunId(null);
    } finally {
      setSending(false);
    }
  }, [attachments, connected, draft, sending]);

  const handleAbort = useCallback(async () => {
    if (!connected || !clientRef.current) {
      return;
    }
    try {
      await clientRef.current.request("chat.abort", {
        sessionKey: DEFAULT_SESSION_KEY,
        runId: activeRunId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeRunId, connected]);

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

  return (
    <div className="chat-page-shell">
      <div className="chat-page-header">
        <div className="chat-page-header-left">
          <h1 className="chat-page-title">Chat</h1>
          <p className="chat-page-subtitle">Session: {DEFAULT_SESSION_KEY}</p>
        </div>
        <div className="chat-page-header-right">
          <span className={`chat-page-badge ${connected ? "is-connected" : ""}`}>
            {connected ? "Connected" : "Disconnected"}
          </span>
          <span className="chat-page-port">Port: {gateway?.port ?? "-"}</span>
          {!gateway?.running ? (
            <button
              type="button"
              className="chat-page-start-btn"
              onClick={() => {
                void handleStartGateway();
              }}
            >
              Start Gateway
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="chat-page-error">{error}</div> : null}

      <div ref={scrollRef} className="chat-page-timeline">
        {loading ? (
          <div className="chat-flow-item chat-flow-item--text">Loading chat history...</div>
        ) : null}

        <div className="chat-flow-list">
          <ChatTimeline timeline={processedTimeline} activeRunningToolKey={activeRunningToolKey} />
          {activeRunId && !hasRecentTextStream && runningTools === 0 ? (
            <div className="chat-flow-item chat-flow-item--thinking-live">
              <p className="chat-flow-thinking-live">Thinking...</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-page-footer">
        {attachments.length > 0 ? (
          <div className="chat-attachments">
            {attachments.map((att) => (
              <div key={att.id} className="chat-attachment">
                <img src={att.dataUrl} alt="Attachment" className="chat-attachment__img" />
                <button
                  type="button"
                  className="chat-attachment__remove"
                  onClick={() => {
                    setAttachments((prev) => prev.filter((p) => p.id !== att.id));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="chat-compose-row">
          <textarea
            className="chat-compose-input"
            rows={1}
            placeholder={
              connected
                ? "Message (Enter to send, Shift+Enter for new line)"
                : "Connect to gateway to chat..."
            }
            disabled={!connected || sending}
            value={draft}
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
          <div className="chat-compose-actions">
            {activeRunId ? (
              <button type="button" className="chat-btn chat-btn--stop" onClick={handleAbort}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="chat-btn chat-btn--send"
                disabled={!connected || sending || (!draft.trim() && attachments.length === 0)}
                onClick={() => {
                  void handleSend();
                }}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
