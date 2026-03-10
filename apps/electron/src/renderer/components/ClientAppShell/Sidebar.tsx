import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import bustlyWordmark from "../../assets/imgs/bustly_wordmark.png";
import logoIcon from "../../assets/imgs/collapsed_logo_v2.svg";
import openSidebarIcon from "../../assets/imgs/open_sidebar.svg";
import { listWorkspaceSummaries, type WorkspaceSummary } from "../../lib/bustly-supabase";
import { GatewayBrowserClient } from "../../lib/gateway-client";
import Skeleton from "../ui/Skeleton";

type ClientAppSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

type SidebarTask = {
  id: string;
  name: string;
  pinned?: boolean;
};

type GatewaySessionRow = {
  key: string;
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  updatedAt: number | null;
};

type SessionsListResult = {
  sessions: GatewaySessionRow[];
};

const DEFAULT_SESSION_KEY = "agent:main:main";
const SIDEBAR_TASKS_REFRESH_EVENT = "openclaw:sidebar-refresh-tasks";

function isMainChannelSessionKey(sessionKey: string): boolean {
  if (sessionKey === DEFAULT_SESSION_KEY) {
    return true;
  }
  return sessionKey.startsWith(`${DEFAULT_SESSION_KEY}:channel:`);
}

function stripLeadingMessageTimestamp(text: string): string {
  const cleaned = text.replace(/^\[[^\]]+\]\s*/, "").trim();
  return cleaned || text.trim();
}

function sanitizeSessionTitle(text: string | undefined): string | null {
  if (!text?.trim()) {
    return null;
  }
  const cleaned = stripLeadingMessageTimestamp(text).trim();
  if (!cleaned) {
    return null;
  }
  return cleaned;
}

type IconProps = {
  className?: string;
};

function CaretDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.7 9.3a1 1 0 0 1 1.4 0L12 13.17l3.9-3.88a1 1 0 0 1 1.4 1.42l-4.6 4.58a1 1 0 0 1-1.4 0L6.7 10.7a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

function CaretRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9.3 6.7a1 1 0 0 1 1.4 0l4.58 4.6a1 1 0 0 1 0 1.4l-4.58 4.6a1 1 0 1 1-1.42-1.4L13.17 12 9.3 8.1a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

function DotsThreeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function HouseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10.5V19h11v-8.5" />
    </svg>
  );
}

function ArrowUpRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 6.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

function SignOutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M14 16.5 18.5 12 14 7.5" />
      <path d="M9 12h9.5" />
      <path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

function LightningIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path d="M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7l-112,120a8,8,0,0,0,3,13l57.63,21.61L88.16,238.43a8,8,0,0,0,13.69,7l112-120A8,8,0,0,0,215.79,118.17ZM109.37,214l10.47-52.38a8,8,0,0,0-5-9.06L62,132.71l84.62-90.66L136.16,94.43a8,8,0,0,0,5,9.06l52.8,19.8Z" />
      </svg>
  );
}

function PencilSimpleLineIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H216a8,8,0,0,0,0-16H115.32l112-112A16,16,0,0,0,227.32,73.37ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.69,147.32,64l24-24L216,84.69Z" />
    </svg>
  );
}

function PushPinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="m14.5 3 6.5 6.5-2 2-2.2-.7-3.3 3.3 3.7 3.7-1.4 1.4-3.7-3.7-5.6 5.6-.9-.9 5.6-5.6-3.7-3.7 1.4-1.4 3.7 3.7 3.3-3.3-.7-2.2 2-2Z" />
    </svg>
  );
}

function PortalTooltip(props: {
  visible: boolean;
  anchor: HTMLElement | null;
  side?: "right" | "bottom";
  children: ReactNode;
}) {
  if (!props.visible || !props.anchor) {
    return null;
  }
  const rect = props.anchor.getBoundingClientRect();
  const side = props.side ?? "right";
  const style =
    side === "bottom"
      ? { top: rect.bottom + 8, left: rect.left + rect.width / 2, transform: "translateX(-50%)" }
      : { top: rect.top + rect.height / 2, left: rect.right + 12, transform: "translateY(-50%)" };
  const arrowClass =
    side === "bottom"
      ? "-top-1 left-1/2 -translate-x-1/2"
      : "top-1/2 -left-1 -translate-y-1/2";
  return createPortal(
    <div
      className="fixed z-[9999] rounded-lg bg-[#1A162F] px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white shadow-lg pointer-events-none animate-in fade-in zoom-in-95 duration-200"
      style={style}
    >
      {props.children}
      <div className={`absolute h-2 w-2 rotate-45 bg-[#1A162F] ${arrowClass}`} />
    </div>,
    document.body,
  );
}

function SidebarItem(props: {
  icon: ((iconProps: IconProps) => ReactNode) | string;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  rightSlot?: ReactNode;
  showTooltip?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div
        ref={itemRef}
        onClick={props.onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`group relative flex cursor-pointer items-center rounded-xl transition-all duration-200 ${
          props.collapsed ? "mx-2 justify-center px-2 py-3" : "mx-4 gap-3 px-4 py-2.5"
        } ${
          props.active
            ? "bg-[#1A162F]/10 font-semibold text-[#1A162F] hover:bg-[#1A162F]/15"
            : "text-slate-500 hover:bg-[#1A162F]/5 hover:text-slate-900"
        }`}
      >
        {typeof props.icon === "string" ? (
          <img src={props.icon} alt={props.label} className="h-[18px] w-[18px] shrink-0" />
        ) : (
          props.icon({ className: "h-[18px] w-[18px] shrink-0" })
        )}
        {!props.collapsed ? <span className="flex-1 truncate whitespace-nowrap text-[14px] font-medium">{props.label}</span> : null}
        {!props.collapsed ? props.rightSlot : null}
      </div>
      <PortalTooltip visible={!!props.collapsed && !!props.showTooltip && isHovered} anchor={itemRef.current}>
        {props.label}
      </PortalTooltip>
    </>
  );
}

function TaskItem(props: {
  task: SidebarTask;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div
        ref={itemRef}
        onClick={props.onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`group relative flex cursor-pointer items-center rounded-xl transition-all duration-200 ${
          props.collapsed ? "mx-2 justify-center px-2 py-3" : "mx-4 gap-3 px-4 py-2.5 pr-10"
        } ${
          props.active
            ? "bg-[#1A162F]/10 font-semibold text-[#1A162F] hover:bg-[#1A162F]/15"
            : "text-slate-500 hover:bg-[#1A162F]/5 hover:text-slate-900"
        }`}
      >
        {!props.collapsed ? <span className="flex-1 truncate text-[14px] font-medium">{props.task.name}</span> : null}
        {!props.collapsed ? (
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 transition-all ${isHovered ? "opacity-100" : "opacity-0"}`}>
            <DotsThreeIcon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
      </div>
      <PortalTooltip visible={props.collapsed && isHovered} anchor={itemRef.current}>
        {props.task.name}
      </PortalTooltip>
    </>
  );
}

function TaskItemSkeleton() {
  return (
    <div className="mx-4 flex items-center gap-3 px-4 py-2.5">
      <Skeleton className="h-3.5 w-full rounded-md" />
    </div>
  );
}

function WorkspaceItemSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-28 rounded-md" />
      </div>
      <Skeleton className="h-5 w-14 rounded-md" />
    </div>
  );
}

function WorkspaceSwitcher(props: {
  collapsed: boolean;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  loading: boolean;
  onBeforeOpen: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onOpenSettings: (workspaceId: string) => void;
  onOpenInvite: (workspaceId: string) => void;
  onOpenManage: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuLayout, setMenuLayout] = useState({ top: 0, left: 0, maxHeight: 520 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const computeMenuLayout = () => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const viewportPadding = 16;
    const width = 340;
    const desiredMaxHeight = 520;
    let left = rect.left;
    if (left + width + viewportPadding > window.innerWidth) {
      left = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
    } else {
      left = Math.max(viewportPadding, left);
    }
    const spaceBelow = window.innerHeight - (rect.bottom + 4) - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const shouldOpenUp = spaceBelow < 360 && spaceAbove > spaceBelow;
    if (shouldOpenUp) {
      const maxHeight = Math.max(280, Math.min(desiredMaxHeight, spaceAbove - 4));
      setMenuLayout({
        top: Math.max(viewportPadding, rect.top - 4 - maxHeight),
        left,
        maxHeight,
      });
      return;
    }
    const maxHeight = Math.max(280, Math.min(desiredMaxHeight, spaceBelow));
    setMenuLayout({
      top: rect.bottom + 4,
      left,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    computeMenuLayout();
    const onResize = () => computeMenuLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen]);

  const activeWorkspace =
    props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId) ??
    props.workspaces[0] ?? {
      id: "",
      name: props.loading ? "Loading workspace..." : "Workspace",
      logoUrl: null,
      role: "member",
      status: "ACTIVE",
      members: 0,
      plan: null,
      expired: false,
    };

  const handleOpenSettings = () => {
    if (!activeWorkspace.id) {
      return;
    }
    setIsOpen(false);
    props.onOpenSettings(activeWorkspace.id);
  };

  const handleOpenInvite = () => {
    if (!activeWorkspace.id) {
      return;
    }
    setIsOpen(false);
    props.onOpenInvite(activeWorkspace.id);
  };

  const handleOpenManage = () => {
    if (!activeWorkspace.id) {
      return;
    }
    setIsOpen(false);
    props.onOpenManage(activeWorkspace.id);
  };

  return (
    <div ref={menuRef} className={props.collapsed ? "relative mx-auto" : "relative"}>
      {props.collapsed ? (
        <button
          type="button"
          onClick={() => {
            props.onBeforeOpen();
            computeMenuLayout();
            setIsOpen((prev) => !prev);
          }}
          className={`[-webkit-app-region:no-drag] flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
            isOpen
              ? "border-[#1A162F] bg-white shadow-md ring-1 ring-[#1A162F]"
              : "border-transparent bg-transparent text-gray-700 hover:border-gray-200 hover:bg-white"
          }`}
        >
          <img src={activeWorkspace.logoUrl || logoIcon} alt="Workspace" className="h-6 w-6 object-contain" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            props.onBeforeOpen();
            computeMenuLayout();
            setIsOpen((prev) => !prev);
          }}
          className={`[-webkit-app-region:no-drag] group relative z-10 flex w-full items-center gap-3 rounded-xl border px-4 py-2 text-left transition-all ${
            isOpen
              ? "border-[#1A162F] bg-white shadow-md ring-1 ring-[#1A162F]"
              : "border-gray-200 bg-white shadow-sm hover:border-gray-300"
          }`}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-100 bg-gray-100 text-gray-700 transition-colors group-hover:border-gray-200">
            <img src={activeWorkspace.logoUrl || logoIcon} alt="Workspace" className="h-full w-full object-contain p-0.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-gray-900">{activeWorkspace.name}</div>
          </div>
          <CaretDownIcon className="h-3 w-3 text-gray-400 transition-colors group-hover:text-gray-600" />
        </button>
      )}

      {isOpen
        ? createPortal(
            <div
              className="fixed z-[9999] flex w-[340px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-100"
              style={{ top: menuLayout.top, left: menuLayout.left, maxHeight: menuLayout.maxHeight }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="custom-scrollbar flex-1 overflow-y-auto">
                <div className="p-4 pb-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm">
                      <img src={activeWorkspace.logoUrl || logoIcon} alt={activeWorkspace.name} className="h-full w-full object-contain p-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 truncate text-base leading-tight font-bold text-gray-900">{activeWorkspace.name}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        {activeWorkspace.members} member{activeWorkspace.members === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-4 pb-4">
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!activeWorkspace.id}
                  >
                    <GearIcon className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenInvite}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!activeWorkspace.id}
                  >
                    <span className="text-sm font-bold">+</span>
                    Invite members
                  </button>
                </div>

                <div className="mx-4 mb-4 flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {activeWorkspace.expired
                        ? "Trial Expired"
                        : activeWorkspace.plan
                          ? activeWorkspace.plan
                          : "Workspace plan"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenManage}
                    className={`rounded-lg px-4 py-1.5 text-xs font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                      activeWorkspace.expired
                        ? "border border-transparent bg-[#1A162F] text-white hover:bg-[#1A162F]/90"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    disabled={!activeWorkspace.id}
                  >
                    {activeWorkspace.expired ? "Renew" : "Manage"}
                  </button>
                </div>

                <div className="mx-0 mb-2 h-px bg-gray-100" />
                <div className="px-4 py-2 text-xs font-medium text-gray-500">All workspaces</div>
                <div className="space-y-0.5 px-2 pb-2">
                  {props.loading && props.workspaces.length === 0 ? (
                    <>
                      <WorkspaceItemSkeleton />
                      <WorkspaceItemSkeleton />
                      <WorkspaceItemSkeleton />
                    </>
                  ) : (
                    props.workspaces.map((workspace) => {
                      const isActive = workspace.id === props.activeWorkspaceId;
                      return (
                        <div
                          key={workspace.id}
                          onClick={() => {
                            props.onSwitchWorkspace(workspace.id);
                            setIsOpen(false);
                          }}
                          className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50 ${
                            isActive ? "bg-gray-50" : ""
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white text-gray-700">
                              <img
                                src={workspace.logoUrl || logoIcon}
                                alt={workspace.name}
                                className="h-full w-full object-contain p-1"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-gray-900">{workspace.name}</div>
                            </div>
                            {workspace.expired ? (
                              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-gray-100 text-gray-600">
                                Expired
                              </span>
                            ) : workspace.plan ? (
                              <span className="shrink-0 rounded bg-[#1A162F] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                                {workspace.plan}
                              </span>
                            ) : null}
                          </div>
                          {isActive ? (
                            <CheckIcon className="ml-2 h-4 w-4 shrink-0 text-gray-900" />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-auto border-t border-gray-100 bg-white p-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    props.onCreateWorkspace();
                  }}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-100 text-gray-400 transition-colors group-hover:border-gray-400 group-hover:text-gray-600">
                    <span className="text-base font-bold">+</span>
                  </div>
                  <span className="text-sm font-medium">Create new workspace</span>
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function ClientAppSidebar(props: ClientAppSidebarProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isTasksExpanded, setIsTasksExpanded] = useState(true);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [recentTasks, setRecentTasks] = useState<SidebarTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [bustlyUserInfo, setBustlyUserInfo] = useState<BustlyUserInfo | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [hasLoadedWorkspaces, setHasLoadedWorkspaces] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsPage = false;
  const isNewTaskPage = location.pathname === "/chat";
  const isSkillPage = location.pathname === "/skill";
  const activeTaskId = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("session") ?? DEFAULT_SESSION_KEY;
  }, [location.search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isUserMenuOpen]);

  useEffect(() => {
    let disposed = false;

    void window.electronAPI.getNativeFullscreenStatus().then((state) => {
      if (!disposed) {
        setIsWindowFullscreen(state.isNativeFullscreen === true);
      }
    });

    const unsubscribe = window.electronAPI.onNativeFullscreenChange((state) => {
      setIsWindowFullscreen(state.isNativeFullscreen === true);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const loadWorkspaces = useCallback(
    async (force = false) => {
      if (workspaceLoading) {
        return;
      }
      if (hasLoadedWorkspaces && !force) {
        return;
      }
      setWorkspaceLoading(true);
      try {
        const result = await listWorkspaceSummaries();
        setWorkspaces(result.workspaces);
        setActiveWorkspaceId(result.activeWorkspaceId);
        setHasLoadedWorkspaces(true);
      } catch {
        setWorkspaces([]);
        setActiveWorkspaceId("");
      } finally {
        setWorkspaceLoading(false);
      }
    },
    [hasLoadedWorkspaces, workspaceLoading],
  );

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBustlyLoginRefresh(() => {
      setHasLoadedWorkspaces(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const clientRef: { current: GatewayBrowserClient | null } = { current: null };
    let requestSettled = false;

    const loadTasks = async () => {
      requestSettled = false;
      if (!disposed) {
        setTasksLoading(true);
        setRecentTasks([]);
      }
      try {
        const status = await window.electronAPI.gatewayStatus();
        if (!status.running) {
          if (!disposed) {
            setRecentTasks([]);
            setTasksLoading(false);
          }
          return;
        }
        const connectConfig = await window.electronAPI.gatewayConnectConfig();
        if (!connectConfig.token || !connectConfig.wsUrl) {
          if (!disposed) {
            setRecentTasks([]);
            setTasksLoading(false);
          }
          return;
        }

        const client = new GatewayBrowserClient({
          url: connectConfig.wsUrl,
          token: connectConfig.token ?? undefined,
          clientName: "openclaw-control-ui",
          mode: "webchat",
          instanceId: `bustly-electron-sidebar-${Date.now()}`,
          onHello: () => {
            if (disposed) {
              return;
            }
            void client
              .request<SessionsListResult>("sessions.list", {
                limit: 20,
                includeGlobal: false,
                includeUnknown: false,
                includeDerivedTitles: true,
                includeLastMessage: false,
              })
              .then((result) => {
                if (disposed) {
                  return;
                }
                requestSettled = true;
                setRecentTasks(
                  result.sessions
                    .filter((session) => isMainChannelSessionKey(session.key))
                    .map((session) => ({
                      id: session.key,
                      name:
                        sanitizeSessionTitle(session.displayName) ||
                        sanitizeSessionTitle(session.derivedTitle) ||
                        sanitizeSessionTitle(session.label) ||
                        session.key,
                    })),
                );
                setTasksLoading(false);
              })
              .catch(() => {
                if (disposed) {
                  return;
                }
                requestSettled = true;
                setRecentTasks([]);
                setTasksLoading(false);
              });
          },
          onClose: () => {
            if (!disposed && requestSettled) {
              setTasksLoading(false);
            }
          },
        });
        clientRef.current = client;
        client.start();
      } catch {
        if (!disposed) {
          setRecentTasks([]);
          setTasksLoading(false);
        }
      }
    };

    void loadTasks();

    const handleRefreshTasks = () => {
      void loadTasks();
    };
    window.addEventListener(SIDEBAR_TASKS_REFRESH_EVENT, handleRefreshTasks);

    return () => {
      disposed = true;
      window.removeEventListener(SIDEBAR_TASKS_REFRESH_EVENT, handleRefreshTasks);
      clientRef.current?.stop();
      clientRef.current = null;
    };
  }, [location.pathname, location.search]);

  useEffect(() => {
    let disposed = false;

    const loadBustlyUserInfo = async () => {
      try {
        const loggedIn = await window.electronAPI.bustlyIsLoggedIn();
        if (!loggedIn) {
          if (!disposed) {
            setBustlyUserInfo(null);
          }
          return;
        }
        const userInfo = await window.electronAPI.bustlyGetUserInfo();
        if (!disposed) {
          setBustlyUserInfo(userInfo);
        }
      } catch {
        if (!disposed) {
          setBustlyUserInfo(null);
        }
      }
    };

    void loadBustlyUserInfo();
    const unsubscribe = window.electronAPI.onBustlyLoginRefresh(() => {
      void loadBustlyUserInfo();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const userName = bustlyUserInfo?.userName?.trim() || "User";
  const userEmail = bustlyUserInfo?.userEmail?.trim() || "user@example.com";
  const avatarSeed = bustlyUserInfo?.userEmail?.trim() || bustlyUserInfo?.userName?.trim() || "User";

  const handleOpenSettings = async () => {
    setIsUserMenuOpen(false);
    await window.electronAPI.bustlyOpenSettings();
  };

  const handleOpenHomepage = () => {
    setIsUserMenuOpen(false);
    void navigate("/chat");
  };

  const handleOpenWorkspaceSettings = (workspaceId: string) => {
    void window.electronAPI.bustlyOpenWorkspaceSettings(workspaceId);
  };

  const handleOpenWorkspaceInvite = (workspaceId: string) => {
    void window.electronAPI.bustlyOpenWorkspaceInvite(workspaceId);
  };

  const handleOpenWorkspaceManage = (workspaceId: string) => {
    void window.electronAPI.bustlyOpenWorkspaceManage(workspaceId);
  };

  const handleCreateWorkspace = () => {
    void window.electronAPI.bustlyOpenWorkspaceCreate();
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    const result = await window.electronAPI.bustlySetActiveWorkspace(workspaceId);
    if (!result.success) {
      return;
    }
    setActiveWorkspaceId(workspaceId);
  };

  const handleSignOut = async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      const result = await window.electronAPI.bustlyLogout();
      if (!result.success) {
        return;
      }
      setBustlyUserInfo(null);
      setIsUserMenuOpen(false);
      const openResult = await window.electronAPI.bustlyOpenLogin();
      if (!openResult.success) {
        void navigate("/bustly-login", { replace: true });
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className={`[-webkit-app-region:drag] z-[100] flex h-full flex-col border-r border-white/40 bg-white/30 backdrop-blur-lg transition-all duration-300 ${
        props.collapsed ? "w-20" : "w-64 overflow-x-hidden"
      } ${isWindowFullscreen ? "pt-0" : "pt-[20px]"}`}
    >
      <div
        className={`group relative flex transition-all duration-300 ${
          props.collapsed ? "flex-col items-center gap-4 pt-6 pb-2" : "flex-col gap-2 px-4 pt-4 pb-0"
        }`}
      >
        {isSettingsPage ? null : (
          <>
            {!props.collapsed ? (
              <div className="flex w-full items-center justify-between">
                <img src={bustlyWordmark} alt="Bustly" className="h-10 w-auto object-contain" />
                <button
                  type="button"
                  onClick={props.onToggleCollapsed}
                  className="[-webkit-app-region:no-drag] rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-gray-100"
                >
                  <img src={openSidebarIcon} alt="Collapse sidebar" className="h-[18px] w-[18px] shrink-0" />
                </button>
              </div>
            ) : null}
            <div className={`transition-all duration-300 ${props.collapsed ? "flex w-full flex-col items-center gap-4" : "w-full"}`}>
              {props.collapsed ? (
                <button
                  type="button"
                  onClick={props.onToggleCollapsed}
                  className="[-webkit-app-region:no-drag] group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
                >
                  <img src={logoIcon} alt="Bustly" className="absolute h-8 w-8 transition-opacity duration-200 group-hover:opacity-0" />
                  <img
                    src={openSidebarIcon}
                    alt="Expand sidebar"
                    className="absolute h-[18px] w-[18px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />
                </button>
              ) : null}
              <WorkspaceSwitcher
                collapsed={props.collapsed}
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId || bustlyUserInfo?.workspaceId || ""}
                loading={workspaceLoading}
                onBeforeOpen={() => {
                  void loadWorkspaces();
                }}
                onSwitchWorkspace={handleSwitchWorkspace}
                onOpenSettings={handleOpenWorkspaceSettings}
                onOpenInvite={handleOpenWorkspaceInvite}
                onOpenManage={handleOpenWorkspaceManage}
                onCreateWorkspace={handleCreateWorkspace}
              />
            </div>
          </>
        )}
      </div>

      <div
        className={`[-webkit-app-region:no-drag] custom-scrollbar flex flex-1 flex-col py-2 ${
          props.collapsed ? "items-center overflow-visible" : "overflow-y-auto overflow-x-hidden"
        }`}
      >
        {!props.collapsed ? (
          <div className="mb-2 w-64 space-y-1">
            <SidebarItem
              icon={PencilSimpleLineIcon}
              label="New Task"
              active={isNewTaskPage && !activeTaskId}
              onClick={() => {
                void navigate("/chat");
              }}
              collapsed={false}
            />

            <SidebarItem
              icon={LightningIcon}
              label="Skills"
              active={isSkillPage}
              onClick={() => {
                void navigate("/skill");
              }}
              collapsed={false}
            />

            <div className="mt-8 pt-8">
              <div
                className="group/header mx-2 mb-2 flex cursor-pointer items-center justify-between rounded-xl px-4 py-1.5 transition-colors hover:bg-gray-100"
                onClick={() => setIsTasksExpanded((prev) => !prev)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider text-slate-500">All tasks</span>
                </div>
                <button type="button" className="text-slate-500 transition-colors hover:text-slate-900">
                  {isTasksExpanded ? <CaretDownIcon className="h-3.5 w-3.5" /> : <CaretRightIcon className="h-3.5 w-3.5" />}
                </button>
              </div>

              {isTasksExpanded ? (
                <div className="space-y-0.5">
                  {tasksLoading ? (
                    <>
                      <TaskItemSkeleton />
                      <TaskItemSkeleton />
                      <TaskItemSkeleton />
                    </>
                  ) : (
                    recentTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        active={activeTaskId === task.id}
                        collapsed={false}
                        onClick={() => {
                          void navigate(`/chat?session=${encodeURIComponent(task.id)}`);
                        }}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col space-y-3 px-2 pt-2">
            <SidebarItem
              icon={PencilSimpleLineIcon}
              label="New Task"
              active={isNewTaskPage && !activeTaskId}
              onClick={() => {
                void navigate("/chat");
              }}
              collapsed
              showTooltip
            />
            <SidebarItem
              icon={LightningIcon}
              label="Skills"
              active={isSkillPage}
              onClick={() => {
                void navigate("/skill");
              }}
              collapsed
              showTooltip
            />
          </div>
        )}
      </div>

      <div
        ref={userMenuRef}
        className={`[-webkit-app-region:no-drag] relative z-20 mt-auto shrink-0 border-t border-gray-100/50 py-3 ${
          props.collapsed ? "flex flex-col items-center px-2" : "px-4"
        }`}
      >
        {isUserMenuOpen ? (
          <div className={`absolute z-50 ${props.collapsed ? "bottom-full left-0 mb-2 ml-2 w-56" : "bottom-full left-0 mb-2 w-full px-4"}`}>
            <div className="space-y-0.5 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={() => {
                  void handleOpenSettings();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                <GearIcon className="h-4 w-4 text-gray-500" />
                Settings
              </button>
              <button
                type="button"
                onClick={handleOpenHomepage}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                <HouseIcon className="h-4 w-4 text-gray-500" />
                <span className="flex-1">Homepage</span>
                <ArrowUpRightIcon className="h-4 w-4 text-gray-400" />
              </button>
              <div className="mx-2 my-1 h-px bg-gray-100" />
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SignOutIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">Sign out</span>
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`relative cursor-pointer rounded-xl p-1.5 outline-none transition-colors hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-[#1A162F]/20 ${
            isUserMenuOpen ? "bg-gray-200" : ""
          } ${props.collapsed ? "flex justify-center" : "flex items-center gap-3"}`}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setIsUserMenuOpen((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsUserMenuOpen((prev) => !prev);
            }
          }}
        >
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(avatarSeed)}&background=1A162F&color=fff`}
            alt="Profile"
            className="h-8 w-8 rounded-full border border-gray-200 bg-white"
          />
          {!props.collapsed ? (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
