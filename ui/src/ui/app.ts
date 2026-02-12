import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() usageLoading = false;
  @state() usageResult: import("./types.js").SessionsUsageResult | null = null;
  @state() usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  @state() usageError: string | null = null;
  @state() usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageSelectedSessions: string[] = [];
  @state() usageSelectedDays: string[] = [];
  @state() usageSelectedHours: number[] = [];
  @state() usageChartMode: "tokens" | "cost" = "tokens";
  @state() usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  @state() usageTimeSeriesLoading = false;
  @state() usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  @state() usageSessionLogsLoading = false;
  @state() usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  @state() usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  @state() usageQueryDraft = "";
  @state() usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  @state() usageSessionSortDir: "desc" | "asc" = "desc";
  @state() usageRecentSessions: string[] = [];
  @state() usageTimeZone: "local" | "utc" = "local";
  @state() usageContextExpanded = false;
  @state() usageHeaderPinned = false;
  @state() usageSessionsTab: "all" | "recent" = "all";
  @state() usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  @state() usageLogFilterTools: string[] = [];
  @state() usageLogFilterHasTools = false;
  @state() usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  // OAuth login states
  @state() oauthLoginPending = false;
  @state() oauthLoginTraceId: string | null = null;
  @state() oauthLoginError: string | null = null;
  @state() oauthLoginSuccess = false;
  private oauthPollInterval: number | null = null;

  // Bustly user authentication state
  @state() bustlyIsLoggedIn = false;
  @state() bustlyUserInfo: {
    userId: string;
    userName: string;
    userEmail: string;
    workspaceId: string;
    skills: string[];
  } | null = null;
  @state() bustlyUserMenuOpen = false;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;
  private bustlyLoginRefreshUnsubscribe: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (navigator.userAgent.includes("Electron")) {
      document.documentElement.classList.add("platform-electron");
    }
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    document.addEventListener("click", this.handleBustlyUserMenuClose.bind(this));

    const electronAPI = (
      window as unknown as {
        electronAPI?: { onBustlyLoginRefresh?: (callback: () => void) => () => void };
      }
    ).electronAPI;
    if (electronAPI?.onBustlyLoginRefresh) {
      this.bustlyLoginRefreshUnsubscribe = electronAPI.onBustlyLoginRefresh(() => {
        void this.checkBustlyLoginStatus();
      });
    }
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    document.removeEventListener("click", this.handleBustlyUserMenuClose.bind(this));
    if (this.bustlyLoginRefreshUnsubscribe) {
      this.bustlyLoginRefreshUnsubscribe();
      this.bustlyLoginRefreshUnsubscribe = null;
    }
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  // OAuth login handler
  async handleBustlyLogin() {
    console.log("[Bustly Login] handleBustlyLogin called");

    if (!this.client || this.oauthLoginPending) {
      return;
    }

    this.oauthLoginPending = true;
    this.oauthLoginError = null;
    this.oauthLoginSuccess = false;

    try {
      const electronAPI = (
        window as unknown as {
          electronAPI?: {
            bustlyLogin?: () => Promise<{ success: boolean; error?: string }>;
          };
        }
      ).electronAPI;
      if (electronAPI?.bustlyLogin) {
        const result = await electronAPI.bustlyLogin();
        if (!result?.success) {
          throw new Error(result?.error ?? "Login failed");
        }
        this.oauthLoginPending = false;
        this.oauthLoginSuccess = true;
        await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
        await this.checkBustlyLoginStatus();
        return;
      }

      // Initiate login flow - request returns payload directly on success
      const loginResult = await this.client.request<{
        loginUrl: string;
        loginTraceId: string;
      }>("oauth.login", {});

      // loginResult is the payload directly: { loginUrl, loginTraceId }
      const { loginUrl, loginTraceId } = loginResult;

      this.oauthLoginTraceId = loginTraceId;

      // Open login URL in new browser window
      window.open(loginUrl, "_blank", "noopener,noreferrer");

      // Start polling for completion
      this.startOAuthPolling(loginTraceId);
    } catch (err) {
      console.error("[Bustly Login] Error:", err);
      this.oauthLoginPending = false;
      this.oauthLoginError = err instanceof Error ? err.message : String(err);
    }
  }

  private startOAuthPolling(loginTraceId: string) {
    console.log("[Bustly Login] startOAuthPolling called with traceId:", loginTraceId);

    // Clear any existing poll interval
    if (this.oauthPollInterval) {
      console.log("[Bustly Login] Clearing existing poll interval");
      window.clearInterval(this.oauthPollInterval);
    }

    // Poll every 2 seconds
    this.oauthPollInterval = window.setInterval(async () => {
      console.log("[Bustly Login] Polling oauth.poll...");
      if (!this.client) {
        console.log("[Bustly Login] No client, stopping poll");
        this.stopOAuthPolling();
        return;
      }

      try {
        // request returns payload directly on success
        const pollData = await this.client.request<{
          pending: boolean;
          tokenResponse?: unknown;
        }>("oauth.poll", {
          loginTraceId: loginTraceId,
        });
        console.log("[Bustly Login] Poll data - pending:", pollData.pending);

        if (!pollData.pending) {
          console.log("[Bustly Login] Login completed successfully!");
          // Login completed successfully
          this.stopOAuthPolling();
          this.oauthLoginPending = false;
          this.oauthLoginSuccess = true;

          // Reload config to show updated skills
          console.log("[Bustly Login] Reloading overview...");
          await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
          await this.checkBustlyLoginStatus();
        }
      } catch (err) {
        // Continue polling on error, unless it's a fatal error
        console.error("[Bustly Login] Poll error:", err);
        // If it's a fatal error, stop polling
        if (err instanceof Error && err.message.includes("fatal")) {
          this.stopOAuthPolling();
          this.oauthLoginPending = false;
          this.oauthLoginError = err.message;
        }
      }
    }, 2000);

    console.log("[Bustly Login] Poll interval started (2s)");

    // Stop polling after 5 minutes
    window.setTimeout(
      () => {
        if (this.oauthLoginPending) {
          console.log("[Bustly Login] Login timeout (5 minutes)");
          this.stopOAuthPolling();
          this.oauthLoginPending = false;
          this.oauthLoginError = "Login timeout";
        }
      },
      5 * 60 * 1000,
    );
  }

  private stopOAuthPolling() {
    console.log("[Bustly Login] stopOAuthPolling called");
    if (this.oauthPollInterval) {
      window.clearInterval(this.oauthPollInterval);
      this.oauthPollInterval = null;
      console.log("[Bustly Login] Poll interval cleared");
    }
  }

  async checkBustlyLoginStatus() {
    if (!this.client) {
      return;
    }

    try {
      const electronAPI = (
        window as unknown as {
          electronAPI?: {
            bustlyIsLoggedIn?: () => Promise<boolean>;
            bustlyGetUserInfo?: () => Promise<{
              userId: string;
              userName: string;
              userEmail: string;
              workspaceId: string;
              skills: string[];
            } | null>;
          };
        }
      ).electronAPI;
      if (electronAPI?.bustlyIsLoggedIn) {
        const loggedIn = await electronAPI.bustlyIsLoggedIn();
        this.bustlyIsLoggedIn = loggedIn;
        if (loggedIn && electronAPI.bustlyGetUserInfo) {
          const userInfo = await electronAPI.bustlyGetUserInfo();
          this.bustlyUserInfo = userInfo ?? null;
        } else {
          this.bustlyUserInfo = null;
        }
        return;
      }

      const result = await this.client.request<{ loggedIn: boolean }>("oauth.is-logged-in", {});
      this.bustlyIsLoggedIn = result.loggedIn;

      if (result.loggedIn) {
        const userInfoResult = await this.client.request<{
          user: {
            userId: string;
            userName: string;
            userEmail: string;
            workspaceId: string;
            skills: string[];
          } | null;
        }>("oauth.get-user-info", {});
        this.bustlyUserInfo = userInfoResult.user ?? null;
      } else {
        this.bustlyUserInfo = null;
      }
    } catch (err) {
      console.error("[Bustly Auth] Failed to check login status:", err);
      this.bustlyIsLoggedIn = false;
      this.bustlyUserInfo = null;
    }
  }

  handleBustlyUserMenuToggle() {
    this.bustlyUserMenuOpen = !this.bustlyUserMenuOpen;
  }

  handleConfigureAiOpen() {
    this.bustlyUserMenuOpen = false;
    const electronAPI = (
      window as unknown as {
        electronAPI?: {
          bustlyOpenProviderSetup?: () => Promise<{ success: boolean; error?: string }>;
        };
      }
    ).electronAPI;
    if (electronAPI?.bustlyOpenProviderSetup) {
      void electronAPI.bustlyOpenProviderSetup();
      return;
    }
    this.setTab("config");
    this.configActiveSection = "models";
    this.configActiveSubsection = null;
  }

  handleBustlyOpenSettings() {
    const electronAPI = (
      window as unknown as {
        electronAPI?: { bustlyOpenSettings?: () => Promise<{ success: boolean; error?: string }> };
      }
    ).electronAPI;
    if (electronAPI?.bustlyOpenSettings) {
      void electronAPI.bustlyOpenSettings();
      return;
    }
    console.warn("[Bustly Auth] Settings link unavailable outside Electron.");
  }

  handleBustlyUserMenuClose(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const menu = this.querySelector(".bustly-user-section");
    if (menu && !menu.contains(target)) {
      this.bustlyUserMenuOpen = false;
    }
  }

  async handleBustlyLogout() {
    if (!this.client) {
      return;
    }

    try {
      const electronAPI = (
        window as unknown as {
          electronAPI?: {
            bustlyLogout?: () => Promise<{ success: boolean; error?: string }>;
            bustlyOpenLogin?: () => Promise<{ success: boolean; error?: string }>;
          };
        }
      ).electronAPI;
      if (electronAPI?.bustlyLogout) {
        const result = await electronAPI.bustlyLogout();
        if (!result?.success) {
          throw new Error(result?.error ?? "Logout failed");
        }
      } else {
        await this.client.request<{ success: boolean }>("oauth.logout", {});
      }
      this.bustlyIsLoggedIn = false;
      this.bustlyUserInfo = null;
      this.bustlyUserMenuOpen = false;
      this.oauthLoginSuccess = false;

      if (electronAPI?.bustlyOpenLogin) {
        const openResult = await electronAPI.bustlyOpenLogin();
        if (openResult?.success) {
          return;
        }
      }

      // Reload overview to reflect logout
      await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
    } catch (err) {
      console.error("[Bustly Auth] Logout failed:", err);
    }
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
