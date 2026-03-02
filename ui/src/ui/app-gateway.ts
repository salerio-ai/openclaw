import {
  GATEWAY_EVENT_UPDATE_AVAILABLE,
  type GatewayUpdateAvailableEventPayload,
} from "../../../src/gateway/events.js";
import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat.ts";
import type { EventLogEntry } from "./app-events.ts";
import { applySettings, loadCron, refreshActiveTab } from "./app-settings.ts";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream.ts";
import type { OpenClawApp } from "./app.ts";
import { loadAgents, loadToolsCatalog } from "./controllers/agents.ts";
import { loadAssistantIdentity } from "./controllers/assistant-identity.ts";
import {
  handleChatEvent,
  loadChatHistory,
  type ChatEventPayload,
  type ChatState,
} from "./controllers/chat.ts";
import { loadDevices } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessions } from "./controllers/sessions.ts";
import {
  resolveGatewayErrorDetailCode,
  type GatewayEventFrame,
  type GatewayHelloOk,
} from "./gateway.ts";
import { GatewayBrowserClient } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import type {
  AgentsListResult,
  PresenceEntry,
  HealthSnapshot,
  StatusSummary,
  UpdateAvailable,
} from "./types.ts";

type GatewayHost = {
  settings: UiSettings;
  password: string;
  clientInstanceId: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  lastErrorCode: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  toolsCatalogLoading: boolean;
  toolsCatalogError: string | null;
  toolsCatalogResult: import("./types.ts").ToolsCatalogResult | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  checkBustlyLoginStatus: () => Promise<void>;
  updateAvailable: UpdateAvailable | null;
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) {
    return raw;
  }
  if (!raw) {
    return mainSessionKey;
  }
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) {
    return;
  }
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.lastErrorCode = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;

  const previousClient = host.client;
  const client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "openclaw-control-ui",
    mode: "webchat",
    instanceId: host.clientInstanceId,
    onHello: (hello) => {
      if (host.client !== client) {
        return;
      }
      host.connected = true;
      host.lastError = null;
      host.lastErrorCode = null;
      host.hello = hello;
      applySnapshot(host, hello);
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream = null;
      (host as unknown as { chatStreamSeq: number | null }).chatStreamSeq = null;
      (host as unknown as { chatThinkingStreamSeq: number | null }).chatThinkingStreamSeq = null;
      (
        host as unknown as { chatThinkingStreamStartedAt: number | null }
      ).chatThinkingStreamStartedAt = null;
      (
        host as unknown as { chatThinkingStreamUpdatedAt: number | null }
      ).chatThinkingStreamUpdatedAt = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      (host as unknown as { chatStreamUpdatedAt: number | null }).chatStreamUpdatedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as OpenClawApp);
      void loadAgents(host as unknown as OpenClawApp);
      void loadToolsCatalog(host as unknown as OpenClawApp);
      void loadNodes(host as unknown as OpenClawApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
      void host.checkBustlyLoginStatus();
    },
    onClose: ({ code, reason, error }) => {
      if (host.client !== client) {
        return;
      }
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      host.lastErrorCode =
        resolveGatewayErrorDetailCode(error) ??
        (typeof error?.code === "string" ? error.code : null);
      if (code !== 1012) {
        if (error?.message) {
          host.lastError = error.message;
          return;
        }
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      } else {
        host.lastError = null;
        host.lastErrorCode = null;
      }
    },
    onEvent: (evt) => {
      if (host.client !== client) {
        return;
      }
      handleGatewayEvent(host, evt);
    },
    onGap: ({ expected, received }) => {
      if (host.client !== client) {
        return;
      }
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
      host.lastErrorCode = null;
    },
  });
  host.client = client;
  previousClient?.stop();
  client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  if (evt.event === "agent" || evt.event === "chat") {
    console.log("[webui] received message", evt.event, evt.payload);
  }
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) {
      return;
    }
    const payload = evt.payload as AgentEventPayload | undefined;
    const normalizeThinkingText = (value: string): string =>
      value.replace(/^Reasoning:\s*\n?/i, "").trimStart();
    const mergeMonotonicStream = (params: {
      current: string;
      text: string | null;
      delta: string | null;
    }): string | null => {
      const { current, text, delta } = params;
      if (typeof text === "string") {
        return !current || text.length >= current.length ? text : current;
      }
      if (typeof delta === "string") {
        return `${current}${delta}`;
      }
      return null;
    };
    const resetLiveSnapshotState = () => {
      (host as unknown as { chatLiveSnapshotRunId: string | null }).chatLiveSnapshotRunId = null;
      (host as unknown as { chatLastAssistantSnapshot: string | null }).chatLastAssistantSnapshot =
        null;
      (host as unknown as { chatLastThinkingSnapshot: string | null }).chatLastThinkingSnapshot =
        null;
    };
    const ensureLiveSnapshotState = (runId: string) => {
      const currentRunId = (host as unknown as { chatLiveSnapshotRunId: string | null })
        .chatLiveSnapshotRunId;
      if (currentRunId === runId) {
        return;
      }
      (host as unknown as { chatLiveSnapshotRunId: string | null }).chatLiveSnapshotRunId = runId;
      (host as unknown as { chatLastAssistantSnapshot: string | null }).chatLastAssistantSnapshot =
        null;
      (host as unknown as { chatLastThinkingSnapshot: string | null }).chatLastThinkingSnapshot =
        null;
    };
    const appendLiveSnapshot = (role: "assistant" | "thinking", text: string, seq?: number) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const lastKey =
        role === "assistant" ? "chatLastAssistantSnapshot" : "chatLastThinkingSnapshot";
      const last = (host as unknown as Record<string, string | null>)[lastKey];
      if (last === trimmed) {
        return;
      }
      (host as unknown as Record<string, string | null>)[lastKey] = trimmed;
      (host as unknown as { chatMessages: unknown[] }).chatMessages = [
        ...(host as unknown as { chatMessages: unknown[] }).chatMessages,
        {
          role,
          content: [{ type: "text", text: trimmed }],
          __openclaw: typeof seq === "number" ? { seq } : undefined,
          seq: typeof seq === "number" ? seq : undefined,
          timestamp: Date.now(),
        },
      ];
    };
    handleAgentEvent(host as unknown as Parameters<typeof handleAgentEvent>[0], payload);
    if (payload) {
      const runMatchesActive =
        Boolean(host.chatRunId) &&
        Boolean(payload.runId) &&
        String(payload.runId) === String(host.chatRunId);
      const stream = typeof payload.stream === "string" ? payload.stream.toLowerCase() : "";
      if (runMatchesActive && payload.runId) {
        ensureLiveSnapshotState(String(payload.runId));
      }
      if (runMatchesActive && stream === "tool") {
        const currentThinking = (
          (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream ?? ""
        ).trim();
        const currentAssistant = (
          (host as unknown as { chatStream: string | null }).chatStream ?? ""
        ).trim();
        if (currentThinking) {
          appendLiveSnapshot("thinking", currentThinking, payload.seq);
        }
        if (currentAssistant) {
          appendLiveSnapshot("assistant", currentAssistant, payload.seq);
        }
        (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream = null;
        (host as unknown as { chatThinkingStreamSeq: number | null }).chatThinkingStreamSeq = null;
        (
          host as unknown as { chatThinkingStreamStartedAt: number | null }
        ).chatThinkingStreamStartedAt = null;
        (
          host as unknown as { chatThinkingStreamUpdatedAt: number | null }
        ).chatThinkingStreamUpdatedAt = null;
        (host as unknown as { chatStream: string | null }).chatStream = null;
        (host as unknown as { chatStreamSeq: number | null }).chatStreamSeq = null;
        (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
        (host as unknown as { chatStreamUpdatedAt: number | null }).chatStreamUpdatedAt = null;
      }
      const explicitThinkingText =
        typeof payload.data?.thinking === "string"
          ? payload.data.thinking
          : typeof payload.data?.reasoning === "string"
            ? payload.data.reasoning
            : null;
      if (runMatchesActive && (stream === "thinking" || explicitThinkingText != null)) {
        const currentAssistant = (
          (host as unknown as { chatStream: string | null }).chatStream ?? ""
        ).trim();
        if (currentAssistant) {
          appendLiveSnapshot("assistant", currentAssistant, payload.seq);
          (host as unknown as { chatStream: string | null }).chatStream = null;
          (host as unknown as { chatStreamSeq: number | null }).chatStreamSeq = null;
          (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
          (host as unknown as { chatStreamUpdatedAt: number | null }).chatStreamUpdatedAt = null;
        }
        const text =
          explicitThinkingText ??
          (stream === "thinking" && typeof payload.data?.text === "string"
            ? payload.data.text
            : null);
        const delta =
          stream === "thinking" && typeof payload.data?.delta === "string"
            ? payload.data.delta
            : null;
        const current =
          (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream ?? "";
        const next = mergeMonotonicStream({ current, text, delta });
        if (next != null) {
          (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream =
            normalizeThinkingText(next);
          (host as unknown as { chatThinkingStreamSeq: number | null }).chatThinkingStreamSeq =
            typeof payload.seq === "number" ? payload.seq : null;
          if (
            (host as unknown as { chatThinkingStreamStartedAt: number | null })
              .chatThinkingStreamStartedAt == null
          ) {
            (
              host as unknown as { chatThinkingStreamStartedAt: number | null }
            ).chatThinkingStreamStartedAt =
              typeof payload.ts === "number" ? payload.ts : Date.now();
          }
          (
            host as unknown as { chatThinkingStreamUpdatedAt: number | null }
          ).chatThinkingStreamUpdatedAt = Date.now();
        }
      }
      if (runMatchesActive && stream === "assistant") {
        const currentThinking = (
          (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream ?? ""
        ).trim();
        if (currentThinking) {
          appendLiveSnapshot("thinking", currentThinking, payload.seq);
          (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream = null;
          (host as unknown as { chatThinkingStreamSeq: number | null }).chatThinkingStreamSeq =
            null;
          (
            host as unknown as { chatThinkingStreamStartedAt: number | null }
          ).chatThinkingStreamStartedAt = null;
          (
            host as unknown as { chatThinkingStreamUpdatedAt: number | null }
          ).chatThinkingStreamUpdatedAt = null;
        }
        const text = typeof payload.data?.text === "string" ? payload.data.text : null;
        const delta = typeof payload.data?.delta === "string" ? payload.data.delta : null;
        const current = (host as unknown as { chatStream: string | null }).chatStream ?? "";
        const next = mergeMonotonicStream({ current, text, delta });
        if (typeof next === "string") {
          (host as unknown as { chatStream: string | null }).chatStream = next;
          (host as unknown as { chatStreamSeq: number | null }).chatStreamSeq =
            typeof payload.seq === "number" ? payload.seq : null;
          if (
            (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt == null
          ) {
            (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt =
              typeof payload.ts === "number" ? payload.ts : Date.now();
          }
          (host as unknown as { chatStreamUpdatedAt: number | null }).chatStreamUpdatedAt =
            Date.now();
        }
      }
      const phase =
        stream === "lifecycle" && typeof payload.data?.phase === "string"
          ? payload.data.phase.toLowerCase()
          : "";
      const isTerminal = phase === "end" || phase === "error";
      if (runMatchesActive && isTerminal) {
        const thinkingText = (
          (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream ?? ""
        ).trim();
        const streamText = (
          (host as unknown as { chatStream: string | null }).chatStream ?? ""
        ).trim();
        if (thinkingText) {
          appendLiveSnapshot("thinking", thinkingText, payload.seq);
        }
        if (streamText) {
          (host as unknown as { chatMessages: unknown[] }).chatMessages = [
            ...(host as unknown as { chatMessages: unknown[] }).chatMessages,
            {
              role: "assistant",
              content: [{ type: "text", text: streamText }],
              __openclaw: typeof payload.seq === "number" ? { seq: payload.seq } : undefined,
              seq: typeof payload.seq === "number" ? payload.seq : undefined,
              timestamp: Date.now(),
              stopReason: phase === "error" ? "error" : "stop",
            },
          ];
        } else if (phase === "error") {
          const error =
            typeof payload.data?.error === "string" ? payload.data.error.trim() : "chat error";
          if (error) {
            (host as unknown as { chatMessages: unknown[] }).chatMessages = [
              ...(host as unknown as { chatMessages: unknown[] }).chatMessages,
              {
                role: "assistant",
                content: [
                  { type: "text", text: /^(error:|err:)/i.test(error) ? error : `Error: ${error}` },
                ],
                __openclaw: typeof payload.seq === "number" ? { seq: payload.seq } : undefined,
                seq: typeof payload.seq === "number" ? payload.seq : undefined,
                timestamp: Date.now(),
                stopReason: "error",
              },
            ];
          }
        }
        (host as unknown as { chatStream: string | null }).chatStream = null;
        (host as unknown as { chatThinkingStream: string | null }).chatThinkingStream = null;
        (host as unknown as { chatStreamSeq: number | null }).chatStreamSeq = null;
        (host as unknown as { chatThinkingStreamSeq: number | null }).chatThinkingStreamSeq = null;
        (
          host as unknown as { chatThinkingStreamStartedAt: number | null }
        ).chatThinkingStreamStartedAt = null;
        (
          host as unknown as { chatThinkingStreamUpdatedAt: number | null }
        ).chatThinkingStreamUpdatedAt = null;
        (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
        (host as unknown as { chatStreamUpdatedAt: number | null }).chatStreamUpdatedAt = null;
        host.chatRunId = null;
        resetLiveSnapshotState();
        void flushChatQueueForEvent(
          host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
        );
        if (phase === "end") {
          void loadChatHistory(host as unknown as OpenClawApp);
        }
        if (payload.runId && host.refreshSessionsAfterChat.has(payload.runId)) {
          host.refreshSessionsAfterChat.delete(payload.runId);
          if (phase === "end") {
            void loadSessions(host as unknown as OpenClawApp, {
              activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
            });
          }
        }
      }
    }
    return;
  }

  if (evt.event === "chat") {
    const payload = evt.payload as ChatEventPayload | undefined;
    // Real-time chat should be single-channel (agent stream only).
    // Ignore chat events for the currently active run to avoid dual-path duplicates.
    if (payload?.runId && host.chatRunId && String(payload.runId) === String(host.chatRunId)) {
      return;
    }
    const next = handleChatEvent(host as unknown as ChatState, payload);
    if (next === "final" || next === "aborted" || next === "error") {
      void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
    }
    if (next === "final" && payload?.runId && host.refreshSessionsAfterChat.has(payload.runId)) {
      host.refreshSessionsAfterChat.delete(payload.runId);
      void loadSessions(host as unknown as OpenClawApp, {
        activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
      });
    }
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
    return;
  }

  if (evt.event === GATEWAY_EVENT_UPDATE_AVAILABLE) {
    const payload = evt.payload as GatewayUpdateAvailableEventPayload | undefined;
    host.updateAvailable = payload?.updateAvailable ?? null;
  }
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
        updateAvailable?: UpdateAvailable;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
  host.updateAvailable = snapshot?.updateAvailable ?? null;
}
