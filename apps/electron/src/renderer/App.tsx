import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

// Types are defined in electron.d.ts
import Onboard from "./components/Onboard";
import BustlyLoginPage from "./components/Onboard/BustlyLoginPage";
import ProviderSetupPage from "./components/Onboard/ProviderSetupPage";
import DevPanel from "./components/DevPanel";
import DesktopChatPage from "./components/DesktopChatPage";
import { GatewayWsClient } from "./lib/gateway-ws-client";
import { extractTextFromMessage, normalizeHistoryMessages, parseTokenFromWsUrl } from "./lib/message-utils";
import type { ChatDisplayMessage, ChatEventPayload } from "./lib/chat-types";

interface LogEntry {
  id: number;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: Date;
}

const DEFAULT_SESSION_KEY = "main";

function resolveSessionKeyFromHello(hello: { snapshot?: unknown } | null | undefined): string {
  const snapshot = hello?.snapshot as
    | {
        sessionDefaults?: {
          mainSessionKey?: unknown;
        };
      }
    | undefined;
  const candidate = snapshot?.sessionDefaults?.mainSessionKey;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  return DEFAULT_SESSION_KEY;
}

function firstTextSegment(message: ChatDisplayMessage): string {
  const segment = message.segments.find((item) => item.type === "text");
  return segment && segment.type === "text" ? segment.text.trim() : "";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeToolValue(value: unknown, max = 200): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : safeJson(value);
  const text = raw.trim();
  if (!text) {
    return undefined;
  }
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function AppShell() {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [bustlyUserInfo, setBustlyUserInfo] = useState<BustlyUserInfo | null>(null);
  const [bustlyLoggingOut, setBustlyLoggingOut] = useState(false);

  const [chatConnected, setChatConnected] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatDisplayMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatStream, setChatStream] = useState<string | null>(null);
  const [chatRunId, setChatRunId] = useState<string | null>(null);
  const [chatLiveSegments, setChatLiveSegments] = useState<ChatDisplayMessage["segments"]>([]);
  const [sessionKey, setSessionKey] = useState(DEFAULT_SESSION_KEY);

  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname || "/";
  const logIdRef = useRef(0);
  const clientRef = useRef<GatewayWsClient | null>(null);
  const clientWsUrlRef = useRef<string | null>(null);
  const chatStreamRef = useRef<string | null>(null);
  const chatRunIdRef = useRef<string | null>(null);
  const chatGatewayRunIdRef = useRef<string | null>(null);
  const sessionKeyRef = useRef(DEFAULT_SESSION_KEY);
  const pendingFinalAssistantTextRef = useRef<string | null>(null);

  const isOnboardWindow = pathname === "/onboard";

  const handleDeepLink = useCallback(
    (data: { url: string; route: string | null } | null) => {
      const route = data?.route;
      if (!route) {
        return;
      }
      if (route === "/") {
        navigate("/", { replace: true });
        return;
      }
      navigate(route, { replace: true });
    },
    [navigate],
  );

  const refreshBustlyUser = useCallback(async () => {
    if (!window.electronAPI) {
      return;
    }
    try {
      const [isLoggedIn, user] = await Promise.all([
        window.electronAPI.bustlyIsLoggedIn(),
        window.electronAPI.bustlyGetUserInfo(),
      ]);
      setBustlyUserInfo(isLoggedIn ? user : null);
    } catch {
      setBustlyUserInfo(null);
    }
  }, []);

  const loadChatHistory = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !chatConnected) {
      return;
    }
    setChatLoading(true);
    try {
      const res = await client.request<{ messages?: unknown[] }>("chat.history", {
        sessionKey,
        limit: 200,
      });
      const history = Array.isArray(res.messages) ? res.messages : [];
      const normalized = normalizeHistoryMessages(history);
      const pendingFinal = pendingFinalAssistantTextRef.current?.trim();
      if (!pendingFinal) {
        setChatMessages(normalized);
        return;
      }
      const hasPendingInHistory = normalized.some(
        (message) => message.role === "assistant" && firstTextSegment(message) === pendingFinal,
      );
      if (hasPendingInHistory) {
        pendingFinalAssistantTextRef.current = null;
        setChatMessages(normalized);
        return;
      }
      setChatMessages([
        ...normalized,
        {
          id: `optimistic-final-${Date.now()}`,
          role: "assistant",
          segments: [{ type: "text", text: pendingFinal }],
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatLoading(false);
    }
  }, [chatConnected, sessionKey]);

  const connectChatGateway = useCallback(
    (status: GatewayStatus | null) => {
      if (!status?.running) {
        clientRef.current?.stop();
        clientRef.current = null;
        clientWsUrlRef.current = null;
        setChatConnected(false);
        return;
      }

      const nextUrl = status.wsUrl;
      const currentClient = clientRef.current;
      if (currentClient && clientWsUrlRef.current === nextUrl) {
        return;
      }

      currentClient?.stop();

      const token = parseTokenFromWsUrl(nextUrl);
      const nextClient = new GatewayWsClient({
        wsUrl: nextUrl,
        token,
        onHello: (hello) => {
          setSessionKey(resolveSessionKeyFromHello(hello));
          setChatConnected(true);
        },
        onClose: ({ code, reason }) => {
          clientRef.current = null;
          clientWsUrlRef.current = null;
          setChatConnected(false);
          setChatRunId(null);
          setChatStream(null);
          chatGatewayRunIdRef.current = null;
          const normalizedReason = (reason || "").trim();
          const isTransient =
            code === 1001 ||
            (code === 1006 && normalizedReason.length === 0) ||
            (code === 1008 &&
              /secure context|localhost|https/i.test(normalizedReason));
          if (!isTransient) {
            setError(`Chat disconnected (${code}): ${normalizedReason || "no reason"}`);
          }
        },
        onEvent: (evt) => {
          if (evt.event === "agent") {
            const payload = evt.payload as
              | {
                  runId?: unknown;
                  sessionKey?: unknown;
                  stream?: unknown;
                  data?: Record<string, unknown>;
                }
              | undefined;
            if (!payload) {
              return;
            }
            const payloadRunId =
              typeof payload.runId === "string" && payload.runId.trim() ? payload.runId.trim() : null;
            const payloadSessionKey =
              typeof payload.sessionKey === "string" && payload.sessionKey.trim()
                ? payload.sessionKey.trim()
                : null;
            const activeClientRunId = chatRunIdRef.current;
            const activeSessionKey = sessionKeyRef.current;
            const boundGatewayRunId = chatGatewayRunIdRef.current;

            if (!activeClientRunId) {
              return;
            }
            if (payloadSessionKey && payloadSessionKey !== activeSessionKey) {
              return;
            }
            if (payloadRunId) {
              if (boundGatewayRunId && payloadRunId !== boundGatewayRunId) {
                return;
              }
              if (!boundGatewayRunId) {
                chatGatewayRunIdRef.current = payloadRunId;
              }
            }

            const stream = typeof payload.stream === "string" ? payload.stream : "";
            const data = payload.data ?? {};

            if (stream === "assistant") {
              const full = typeof data.text === "string" ? data.text : null;
              const delta = typeof data.delta === "string" ? data.delta : null;
              const thinking = typeof data.thinking === "string" ? data.thinking : null;
              setChatStream((prev) => {
                if (full !== null) {
                  return full;
                }
                if (delta !== null) {
                  return `${prev ?? ""}${delta}`;
                }
                return prev;
              });
              setChatLiveSegments((prev) => {
                const next = [...prev];
                const textIdx = next.findIndex((segment) => segment.type === "text");
                const nextText = full !== null ? full : delta !== null ? `${chatStreamRef.current ?? ""}${delta}` : null;
                if (nextText !== null) {
                  if (textIdx === -1) {
                    next.unshift({ type: "text", text: nextText });
                  } else {
                    next[textIdx] = { type: "text", text: nextText };
                  }
                }
                if (thinking !== null) {
                  const thinkingIdx = next.findIndex((segment) => segment.type === "thinking");
                  if (thinkingIdx === -1) {
                    next.push({ type: "thinking", text: thinking });
                  } else {
                    next[thinkingIdx] = { type: "thinking", text: thinking };
                  }
                }
                return next;
              });
              return;
            }

            if (stream === "tool") {
              const phase = typeof data.phase === "string" ? data.phase : "";
              const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "tool";
              const toolCallId =
                typeof data.toolCallId === "string" && data.toolCallId.trim()
                  ? data.toolCallId.trim()
                  : `${name}-${Date.now()}`;
              setChatLiveSegments((prev) => {
                const next = [...prev];
                const index = next.findIndex(
                  (segment) => segment.type === "toolCall" && segment.toolCallId === toolCallId,
                );
                const current = index >= 0 && next[index]?.type === "toolCall" ? next[index] : undefined;
                const summary =
                  phase === "start"
                    ? summarizeToolValue(data.args)
                    : phase === "update"
                      ? summarizeToolValue(data.partialResult)
                      : phase === "result"
                        ? summarizeToolValue(data.result)
                        : phase === "error"
                          ? summarizeToolValue(data.error ?? data.message)
                          : current?.summary;
                const status =
                  phase === "result"
                    ? "completed"
                    : phase === "error"
                      ? "error"
                      : ("start" as const);
                const segment = {
                  type: "toolCall" as const,
                  toolCallId,
                  name,
                  status,
                  summary,
                };
                if (index === -1) {
                  next.push(segment);
                } else {
                  next[index] = segment;
                }
                return next;
              });
            }
            return;
          }

          if (evt.event !== "chat") {
            return;
          }
          const payload = evt.payload as ChatEventPayload | undefined;
          if (!payload || payload.sessionKey !== sessionKeyRef.current) {
            return;
          }
          const activeClientRunId = chatRunIdRef.current;
          const boundGatewayRunId = chatGatewayRunIdRef.current;
          if (activeClientRunId && payload.runId) {
            if (!boundGatewayRunId) {
              chatGatewayRunIdRef.current = payload.runId;
            } else if (payload.runId !== boundGatewayRunId) {
              if (payload.state === "final") {
                window.setTimeout(() => {
                  void loadChatHistory();
                }, 300);
              }
              return;
            }
          }

          if (payload.state === "delta") {
            const next = extractTextFromMessage(payload.message);
            if (next) {
              setChatStream((prev) => {
                if (!prev || next.length >= prev.length) {
                  return next;
                }
                return prev;
              });
              setChatLiveSegments((prev) => {
                const nextSegments = [...prev];
                const textIdx = nextSegments.findIndex((segment) => segment.type === "text");
                if (textIdx === -1) {
                  nextSegments.unshift({ type: "text", text: next });
                } else {
                  nextSegments[textIdx] = { type: "text", text: next };
                }
                return nextSegments;
              });
            }
            return;
          }

          if (payload.state === "final") {
            const finalText =
              extractTextFromMessage(payload.message).trim() || (chatStreamRef.current ?? "").trim();
            if (finalText) {
              pendingFinalAssistantTextRef.current = finalText;
              setChatMessages((prev) => [
                ...prev,
                {
                  id: `final-${payload.runId}-${Date.now()}`,
                  role: "assistant",
                  segments: [{ type: "text", text: finalText }],
                },
              ]);
            }
            setChatRunId(null);
            setChatStream(null);
            setChatLiveSegments([]);
            chatGatewayRunIdRef.current = null;
            window.setTimeout(() => {
              void loadChatHistory();
            }, 400);
            return;
          }

          if (payload.state === "aborted") {
            setChatRunId(null);
            setChatStream(null);
            setChatLiveSegments([]);
            chatGatewayRunIdRef.current = null;
            return;
          }

          if (payload.state === "error") {
            setChatRunId(null);
            setChatStream(null);
            setChatLiveSegments([]);
            chatGatewayRunIdRef.current = null;
            const message = payload.errorMessage?.trim() || "chat error";
            setError(message);
            setChatMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                segments: [{ type: "text", text: /^error:/i.test(message) ? message : `Error: ${message}` }],
              },
            ]);
          }
        },
      });
      clientRef.current = nextClient;
      clientWsUrlRef.current = nextUrl;
      nextClient.start();
    },
    [loadChatHistory, sessionKey],
  );

  useEffect(() => {
    if (!chatConnected) {
      return;
    }
    void loadChatHistory();
  }, [chatConnected, loadChatHistory, sessionKey]);

  const sendChat = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !chatConnected) {
      return;
    }
    const message = chatDraft.trim();
    if (!message) {
      return;
    }

    setChatDraft("");
    setError(null);
    setChatSending(true);
    const runId = crypto.randomUUID();
    setChatRunId(runId);
    chatRunIdRef.current = runId;
    chatGatewayRunIdRef.current = null;
    setChatStream("");
    setChatLiveSegments([]);

    setChatMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        segments: [{ type: "text", text: message }],
      },
    ]);

    try {
      await client.request("chat.send", {
        sessionKey,
        message,
        deliver: false,
        idempotencyKey: runId,
      });
    } catch (err) {
      const nextError = err instanceof Error ? err.message : String(err);
      setError(nextError);
      setChatRunId(null);
      setChatStream(null);
      setChatLiveSegments([]);
      chatRunIdRef.current = null;
      chatGatewayRunIdRef.current = null;
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          segments: [{ type: "text", text: /^error:/i.test(nextError) ? nextError : `Error: ${nextError}` }],
        },
      ]);
    } finally {
      setChatSending(false);
    }
  }, [chatConnected, chatDraft, sessionKey]);

  const abortChat = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !chatConnected) {
      return;
    }
    try {
      await client.request("chat.abort", chatRunId ? { sessionKey, runId: chatRunId } : { sessionKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [chatConnected, chatRunId, sessionKey]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (!window.electronAPI) {
        setError("Electron API not available. Are you running in a browser?");
        return;
      }

      try {
        const [status, info, initialized, needsOnboard] = await Promise.all([
          window.electronAPI.gatewayStatus(),
          window.electronAPI.getAppInfo(),
          window.electronAPI.openclawIsInitialized(),
          window.electronAPI.openclawNeedsOnboard(),
        ]);

        setGatewayStatus(status);
        setAppInfo(info);
        setShowOnboard(needsOnboard && !initialized);

        if (initialized || !needsOnboard) {
          void refreshBustlyUser();
          connectChatGateway(status);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadInitialData();
  }, [connectChatGateway, refreshBustlyUser]);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await window.electronAPI.gatewayStatus();
        if (!cancelled) {
          setGatewayStatus(status);
          connectChatGateway(status);
        }
      } catch {
        // ignore polling errors
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connectChatGateway]);

  useEffect(() => {
    chatStreamRef.current = chatStream;
  }, [chatStream]);

  useEffect(() => {
    chatRunIdRef.current = chatRunId;
  }, [chatRunId]);

  useEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  useEffect(() => {
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
      chatStreamRef.current = null;
      chatRunIdRef.current = null;
      chatGatewayRunIdRef.current = null;
      pendingFinalAssistantTextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const unsubscribe = window.electronAPI.onGatewayLog((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: data.stream as "stdout" | "stderr",
          message: data.message,
          timestamp: new Date(),
        },
      ]);
      setLogs((prev) => prev.slice(-1000));
    });

    const unsubscribeExit = window.electronAPI.onGatewayExit((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: "stderr",
          message: `Gateway exited: code=${data.code}, signal=${data.signal}`,
          timestamp: new Date(),
        },
      ]);
      setGatewayStatus((prev) => (prev ? { ...prev, running: false, pid: null } : null));
    });

    const unsubscribeMain = window.electronAPI.onMainLog((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          stream: "stderr",
          message: `[main] ${data.message}`,
          timestamp: new Date(),
        },
      ]);
      setLogs((prev) => prev.slice(-1000));
    });

    return () => {
      unsubscribe();
      unsubscribeExit();
      unsubscribeMain();
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onBustlyLoginRefresh) {
      return;
    }
    const unsubscribe = window.electronAPI.onBustlyLoginRefresh(() => {
      void refreshBustlyUser();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshBustlyUser]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) {
      return;
    }
    const unsubscribe = window.electronAPI.onUpdateStatus((data) => {
      if (data.event === "available" || data.event === "download-progress") {
        setUpdateMessage("A new version was found. Updating now...");
      } else if (data.event === "downloaded") {
        setUpdateMessage("Find new version available.");
      } else if (data.event === "error") {
        setUpdateMessage(null);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }
    void window.electronAPI.consumePendingDeepLink().then((data) => {
      handleDeepLink(data);
    });
    const unsubscribe = window.electronAPI.onDeepLink((data) => {
      handleDeepLink(data);
    });
    return () => {
      unsubscribe();
    };
  }, [handleDeepLink]);

  const handleStartGateway = useCallback(async () => {
    if (!window.electronAPI) {
      return;
    }
    setError(null);
    const result = await window.electronAPI.gatewayStart();
    if (!result.success) {
      setError(result.error ?? "Failed to start gateway");
      return;
    }
    const status = await window.electronAPI.gatewayStatus();
    setGatewayStatus(status);
    connectChatGateway(status);
  }, [connectChatGateway]);

  const handleStopGateway = useCallback(async () => {
    if (!window.electronAPI) {
      return;
    }
    setError(null);
    const result = await window.electronAPI.gatewayStop();
    if (!result.success) {
      setError(result.error ?? "Failed to stop gateway");
      return;
    }
    clientRef.current?.stop();
    clientRef.current = null;
    clientWsUrlRef.current = null;
    setChatConnected(false);
    setChatRunId(null);
    setChatStream(null);
    const status = await window.electronAPI.gatewayStatus();
    setGatewayStatus(status);
  }, []);

  const handleOpenControlUI = useCallback(async () => {
    setError("Control UI has been replaced by the built-in desktop chat page.");
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const handleReOnboard = useCallback(async () => {
    if (!window.electronAPI) {
      return;
    }
    setError(null);
    const result = await window.electronAPI.openclawReset();
    if (!result.success) {
      setError(result.error ?? "Failed to reset onboarding");
      return;
    }
    setShowOnboard(true);
  }, []);

  const handleOnboardComplete = useCallback(async () => {
    setShowOnboard(false);
    if (window.electronAPI) {
      const status = await window.electronAPI.gatewayStatus();
      setGatewayStatus(status);
      connectChatGateway(status);
    }
    void refreshBustlyUser();
  }, [connectChatGateway, refreshBustlyUser]);

  const handleOnboardCancel = useCallback(() => {
    setShowOnboard(false);
  }, []);

  const handleBustlyLogin = useCallback(async () => {
    try {
      await window.electronAPI?.bustlyOpenLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleBustlyLogout = useCallback(async () => {
    if (!window.electronAPI) {
      return;
    }
    setBustlyLoggingOut(true);
    try {
      const result = await window.electronAPI.bustlyLogout();
      if (!result.success) {
        setError(result.error ?? "Failed to log out");
        return;
      }
      setBustlyUserInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBustlyLoggingOut(false);
    }
  }, []);

  const handleOpenSettings = useCallback(async () => {
    try {
      await window.electronAPI?.bustlyOpenSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setChatRunId(null);
    setChatStream(null);
    setChatLiveSegments([]);
    chatRunIdRef.current = null;
    chatGatewayRunIdRef.current = null;
    setChatDraft("");
  }, []);

  const canSend = useMemo(() => {
    return chatConnected && !chatSending && chatDraft.trim().length > 0;
  }, [chatConnected, chatDraft, chatSending]);

  const renderDefault = () => {
    if (showOnboard || isOnboardWindow) {
      return <Onboard onComplete={handleOnboardComplete} onCancel={handleOnboardCancel} />;
    }

    return (
      <DesktopChatPage
        appInfo={appInfo}
        gatewayStatus={gatewayStatus}
        chatConnected={chatConnected}
        chatLoading={chatLoading}
        chatSending={chatSending}
        chatMessages={chatMessages}
        chatDraft={chatDraft}
        chatStream={chatStream}
        chatRunId={chatRunId}
        chatLiveSegments={chatLiveSegments}
        canSend={canSend}
        error={error}
        updateMessage={updateMessage}
        bustlyUserInfo={bustlyUserInfo}
        bustlyLoggingOut={bustlyLoggingOut}
        onRefresh={() => {
          void loadChatHistory();
        }}
        onNewChat={handleNewChat}
        onStartGateway={() => {
          void handleStartGateway();
        }}
        onStopGateway={() => {
          void handleStopGateway();
        }}
        onBustlyLogin={() => {
          void handleBustlyLogin();
        }}
        onOpenSettings={() => {
          void handleOpenSettings();
        }}
        onBustlyLogout={() => {
          void handleBustlyLogout();
        }}
        onDraftChange={setChatDraft}
        onSend={() => {
          void sendChat();
        }}
        onAbort={() => {
          void abortChat();
        }}
      />
    );
  };

  return (
    <Routes>
      <Route
        path="/devpanel"
        element={
          <DevPanel
            appInfo={appInfo}
            gatewayStatus={gatewayStatus}
            logs={logs}
            error={error}
            onStartGateway={handleStartGateway}
            onStopGateway={handleStopGateway}
            onReOnboard={handleReOnboard}
            onOpenControlUI={handleOpenControlUI}
            onClearLogs={handleClearLogs}
          />
        }
      />
      <Route
        path="/bustly-login"
        element={
          <BustlyLoginPage
            onContinue={() => {
              navigate("/", { replace: true });
            }}
            autoContinue
            showSignOut={false}
            showContinueWhenLoggedIn={false}
          />
        }
      />
      <Route
        path="/provider-setup"
        element={
          <ProviderSetupPage
            onDone={() => {
              navigate("/", { replace: true });
            }}
          />
        }
      />
      <Route
        path="/onboard"
        element={<Onboard onComplete={handleOnboardComplete} onCancel={handleOnboardCancel} />}
      />
      <Route path="/" element={renderDefault()} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
