import { createPortal } from "react-dom";
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  Check,
  DotsThree,
  Gear,
  House,
  Lightning,
  Plus,
  PencilSimpleLine,
  SquaresFour,
  SignOut,
  Trash,
  X,
} from "@phosphor-icons/react";
import bustlyWordmark from "../../assets/imgs/bustly_wordmark.png";
import logoIcon from "../../assets/imgs/collapsed_logo_v2.svg";
import openSidebarIcon from "../../assets/imgs/open_sidebar.svg";
import {
  buildChatRoute,
  CollapsedScenariosIcon,
  deriveScenarioLabel,
  getSessionIconComponent,
  resolveSessionIconComponent,
  SESSION_ICON_OPTIONS,
  type SessionIconId,
} from "../../lib/session-icons";
import { listWorkspaceSummaries, type WorkspaceSummary } from "../../lib/bustly-supabase";
import { GatewayBrowserClient } from "../../lib/gateway-client";
import { useAppState } from "../../providers/AppStateProvider";
import {
  buildBustlyWorkspaceAgentId,
  buildBustlyWorkspaceMainSessionKey,
  isAgentChannelSessionKey,
  isAgentMainSessionKey,
} from "../../../shared/bustly-agent";
import Skeleton from "../ui/Skeleton";

type ClientAppSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

type SidebarTask = {
  id: string;
  name: string;
  icon?: string;
  isMain?: boolean;
};

type GatewaySessionRow = {
  key: string;
  label?: string;
  icon?: string;
  displayName?: string;
  derivedTitle?: string;
  updatedAt: number | null;
};

type SessionsListResult = {
  sessions: GatewaySessionRow[];
};

const SIDEBAR_TASKS_REFRESH_EVENT = "openclaw:sidebar-refresh-tasks";
const SIDEBAR_CUSTOM_LABELS_STORAGE_KEY = "bustly.sidebar.custom-labels.v1";

function notifySidebarTasksRefresh() {
  window.dispatchEvent(new Event(SIDEBAR_TASKS_REFRESH_EVENT));
}

function readCustomSessionLabels(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_CUSTOM_LABELS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeCustomSessionLabels(value: Record<string, string>) {
  window.localStorage.setItem(SIDEBAR_CUSTOM_LABELS_STORAGE_KEY, JSON.stringify(value));
}

function isMainChannelSessionKey(sessionKey: string, agentId: string): boolean {
  return isAgentMainSessionKey(sessionKey, agentId) || isAgentChannelSessionKey(sessionKey, agentId);
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

function resolveSessionDisplayName(
  session: Pick<GatewaySessionRow, "key" | "label" | "displayName" | "derivedTitle">,
  customSessionLabels: Record<string, string>,
): string {
  return (
    sanitizeSessionTitle(session.label) ||
    sanitizeSessionTitle(session.displayName) ||
    sanitizeSessionTitle(session.derivedTitle) ||
    customSessionLabels[session.key] ||
    deriveScenarioLabel(session.key)
  );
}

function resolveChannelBaseSessionKey(sessionKey: string): string {
  return sessionKey.replace(/:(thread|topic|channel|group):[^:]+$/i, "");
}

function buildChannelSessionKey(sessionKey: string): string {
  return `${resolveChannelBaseSessionKey(sessionKey)}:channel:${globalThis.crypto.randomUUID()}`;
}

type IconProps = {
  className?: string;
};

function CaretDownIcon({ className }: IconProps) {
  return <CaretDown size={14} weight="bold" className={className} />;
}

function CaretRightIcon({ className }: IconProps) {
  return <CaretRight size={14} weight="bold" className={className} />;
}

function DotsThreeIcon({ className }: IconProps) {
  return <DotsThree size={18} weight="bold" className={className} />;
}

function CheckIcon({ className }: IconProps) {
  return <Check size={16} weight="bold" className={className} />;
}

function CloseIcon({ className }: IconProps) {
  return <X size={16} weight="bold" className={className} />;
}

function GearIcon({ className }: IconProps) {
  return <Gear size={16} weight="bold" className={className} />;
}

function HouseIcon({ className }: IconProps) {
  return <House size={16} weight="bold" className={className} />;
}

function ArrowUpRightIcon({ className }: IconProps) {
  return <ArrowSquareOut size={16} weight="bold" className={className} />;
}

function SignOutIcon({ className }: IconProps) {
  return <SignOut size={16} weight="bold" className={className} />;
}

function LightningIcon({ className }: IconProps) {
  return <Lightning size={18} weight="bold" className={className} />;
}

function PencilSimpleLineIcon({ className }: IconProps) {
  return <PencilSimpleLine size={18} weight="bold" className={className} />;
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

function SidebarModal(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!props.open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [props.open, props.onClose]);

  if (!props.open) {
    return null;
  }
  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/20 p-4"
      onClick={props.onClose}
    >
      <div
        className={`w-full rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl ${props.widthClassName ?? "max-w-sm"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#1A162F]">{props.title}</h2>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            onClick={props.onClose}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

function SidebarItem(props: {
  icon: ComponentType<Record<string, unknown>> | string;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  rightSlot?: ReactNode;
  rightSlotVisible?: boolean;
  showTooltip?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  insetClassName?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div
        ref={itemRef}
        onClick={props.onClick}
        onMouseEnter={() => {
          setIsHovered(true);
          props.onMouseEnter?.();
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          props.onMouseLeave?.();
        }}
        className={`group relative flex cursor-pointer items-center rounded-xl transition-all duration-200 ${
          props.collapsed
            ? props.insetClassName ?? "mx-2 justify-center px-2 py-3"
            : props.insetClassName ?? "mx-4 gap-3 px-4 py-2.5"
        } ${
          props.active
            ? "bg-[#1A162F]/10 font-semibold text-[#1A162F] hover:bg-[#1A162F]/15"
            : "text-slate-500 hover:bg-[#1A162F]/5 hover:text-slate-900"
        }`}
      >
        {typeof props.icon === "string" ? (
          <img src={props.icon} alt={props.label} className="h-[18px] w-[18px] shrink-0" />
        ) : (
          createElement(props.icon, { className: "h-[18px] w-[18px] shrink-0", size: 18, weight: "bold" })
        )}
        {!props.collapsed ? (
          <div className={`min-w-0 flex-1 transition-[padding] duration-150 ${props.rightSlot && props.rightSlotVisible ? "pr-11" : ""}`}>
            <span
              className={`block min-w-0 truncate whitespace-nowrap text-[14px] ${props.active ? "font-medium" : "font-normal"}`}
              title={props.label}
            >
              {props.label}
            </span>
          </div>
        ) : null}
        {!props.collapsed && props.rightSlot ? (
          <div className="absolute top-1/2 right-4 z-10 flex -translate-y-1/2 items-center">{props.rightSlot}</div>
        ) : null}
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
  onRename: () => void;
  onDelete: () => void;
  onChangeIcon: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const SessionIcon = resolveSessionIconComponent({
    icon: props.task.icon,
    label: props.task.name,
    sessionKey: props.task.id,
  });

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <>
      <SidebarItem
        icon={SessionIcon}
        label={props.task.name}
        active={props.active}
        onClick={props.onClick}
        collapsed={props.collapsed}
        showTooltip
        rightSlotVisible={isHovered || menuOpen}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        rightSlot={
          !props.collapsed ? (
            <button
              ref={triggerRef}
              type="button"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md p-1 transition-all ${
                isHovered || menuOpen ? "opacity-100" : "opacity-0"
              } ${
                menuOpen ? "bg-white/88 shadow-sm backdrop-blur-sm" : ""
              } ${
                props.active ? "text-[#1A162F] hover:bg-[#1A162F]/6" : "text-text-sub hover:bg-black/[0.04]"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
            >
              <DotsThreeIcon className="h-4 w-4" />
            </button>
          ) : null
        }
      />
      {menuOpen && !props.collapsed && triggerRef.current
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[11000] min-w-[160px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
              style={{
                top: triggerRef.current.getBoundingClientRect().bottom + 6,
                left: triggerRef.current.getBoundingClientRect().left,
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                onClick={() => {
                  setMenuOpen(false);
                  props.onChangeIcon();
                }}
              >
                <SquaresFour size={16} weight="bold" />
                Change icon
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                onClick={() => {
                  setMenuOpen(false);
                  props.onRename();
                }}
              >
                Rename
              </button>
              {!props.task.isMain ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    props.onDelete();
                  }}
                >
                  Delete scenario
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CollapsedScenariosButton(props: {
  tasks: SidebarTask[];
  activeTaskId: string;
  onOpenTask: (task: SidebarTask) => void;
  onRenameClick: (task: SidebarTask) => void;
  onDeleteClick: (task: SidebarTask) => void;
  onChangeIcon: (task: SidebarTask) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<SidebarTask | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const activeTask = props.tasks.find((task) => task.id === props.activeTaskId);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: Math.max(20, rect.top - 8),
      left: rect.right + 14,
    });
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openPanel = useCallback(() => {
    clearCloseTimeout();
    updatePosition();
    setIsOpen(true);
  }, [clearCloseTimeout, updatePosition]);

  const scheduleClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setMenuTask(null);
    }, 120);
  }, [clearCloseTimeout]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleResize = () => updatePosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      setMenuTask(null);
    };
    window.addEventListener("resize", handleResize);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousedown", handlePointerDown);
      clearCloseTimeout();
    };
  }, [clearCloseTimeout, isOpen, updatePosition]);

  const openTaskMenu = (event: ReactMouseEvent<HTMLButtonElement>, task: SidebarTask) => {
    event.stopPropagation();
    clearCloseTimeout();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const viewportPadding = 12;
    const preferredLeft = rect.right + 8;
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    setMenuPosition({
      top: Math.max(16, rect.top - 6),
      left: Math.min(preferredLeft, maxLeft),
    });
    setMenuTask(task);
  };

  return (
    <>
      <div ref={triggerRef} onMouseEnter={openPanel} onMouseLeave={scheduleClose} className="flex w-full justify-center">
        <button
          type="button"
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
              setMenuTask(null);
              return;
            }
            openPanel();
          }}
          className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
            activeTask ? "bg-[#1A162F]/10 text-[#1A162F]" : "text-text-sub hover:bg-[#1A162F]/5 hover:text-text-main"
          }`}
          aria-label="Scenarios"
          title="Scenarios"
        >
          <CollapsedScenariosIcon size={18} weight="bold" />
        </button>
      </div>

      {isOpen
        ? createPortal(
            <div
              ref={panelRef}
              onMouseEnter={openPanel}
              onMouseLeave={scheduleClose}
              className="fixed z-[9999] w-[280px] rounded-2xl border border-[#E6E9F0] bg-white p-2 shadow-[0_18px_48px_rgba(26,22,47,0.14)]"
              style={{ top: coords.top, left: coords.left }}
            >
              <div className="px-2 pt-1 pb-2 text-xs font-medium text-[#666F8D]">Scenarios</div>
              <div className="space-y-0.5">
                {props.tasks.map((task) => {
                  const Icon = resolveSessionIconComponent({
                    icon: task.icon,
                    label: task.name,
                    sessionKey: task.id,
                  });
                  const isActive = task.id === props.activeTaskId;
                  return (
                    <div
                      key={task.id}
                      className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
                        isActive ? "bg-[#1A162F]/10" : "hover:bg-[#F5F7FB]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          props.onOpenTask(task);
                          setIsOpen(false);
                          setMenuTask(null);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors ${
                          isActive ? "text-[#1A162F]" : "text-[#666F8D] hover:text-[#1A162F]"
                        }`}
                      >
                        <Icon size={17} weight="bold" className="shrink-0" />
                        <span className={`min-w-0 flex-1 truncate text-sm ${isActive ? "font-medium" : "font-normal"}`}>
                          {task.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openTaskMenu(event, task)}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          menuTask?.id === task.id
                            ? "bg-[#EEF1F6] text-[#1A162F]"
                            : "text-[#8A93B2] hover:bg-[#EEF1F6] hover:text-[#1A162F]"
                        }`}
                      >
                        <DotsThree size={15} weight="bold" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {menuTask
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[10000] w-44 rounded-xl border border-[#E6E9F0] bg-white p-1.5 shadow-[0_18px_48px_rgba(26,22,47,0.14)]"
              style={{ top: menuPosition.top, left: menuPosition.left }}
              onMouseEnter={openPanel}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                onClick={() => {
                  props.onChangeIcon(menuTask);
                  setMenuTask(null);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-[#666F8D] transition-colors hover:bg-[#F5F7FB] hover:text-[#1A162F]"
              >
                <SquaresFour size={16} weight="bold" />
                Change icon
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onRenameClick(menuTask);
                  setMenuTask(null);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-[#666F8D] transition-colors hover:bg-[#F5F7FB] hover:text-[#1A162F]"
              >
                <PencilSimpleLine size={16} weight="bold" />
                Rename
              </button>
              {!menuTask.isMain ? <div className="my-1 h-px bg-[#EEF1F6]" /> : null}
              {!menuTask.isMain ? (
                <button
                  type="button"
                  onClick={() => {
                    props.onDeleteClick(menuTask);
                    setMenuTask(null);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash size={16} weight="bold" />
                  Delete
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
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

function WorkspaceTriggerSkeleton(props: { collapsed: boolean }) {
  if (props.collapsed) {
    return <Skeleton className="h-10 w-10 rounded-xl" />;
  }
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
      <Skeleton className="h-6 w-6 rounded-md" />
      <Skeleton className="h-5 w-32 rounded-md" />
      <Skeleton className="ml-auto h-3 w-3 rounded-sm" />
    </div>
  );
}

function getWorkspaceInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "W";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0]?.slice(0, 1) ?? ""}${parts[1]?.slice(0, 1) ?? ""}`.toUpperCase();
}

function WorkspaceAvatar(props: {
  name: string;
  logoUrl: string | null | undefined;
  className: string;
  imageClassName?: string;
  initialsClassName?: string;
}) {
  if (props.logoUrl) {
    return <img src={props.logoUrl} alt={props.name} className={props.imageClassName ?? props.className} />;
  }
  return (
    <div className={props.className}>
      <span className={props.initialsClassName ?? "text-sm font-semibold text-[#1A162F]"}>
        {getWorkspaceInitials(props.name)}
      </span>
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
      name: "Workspace",
      logoUrl: null,
      role: "member",
      status: "ACTIVE",
      members: 0,
      plan: null,
      expired: false,
    };
  const showWorkspaceSkeleton = props.loading && props.workspaces.length === 0;

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
        showWorkspaceSkeleton ? (
          <WorkspaceTriggerSkeleton collapsed />
        ) : (
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
            <WorkspaceAvatar
              name={activeWorkspace.name}
              logoUrl={activeWorkspace.logoUrl}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E5E7EB]"
              imageClassName="h-6 w-6 object-contain"
              initialsClassName="text-sm font-semibold text-[#1A162F]"
            />
          </button>
        )
      ) : (
        showWorkspaceSkeleton ? (
          <WorkspaceTriggerSkeleton collapsed={false} />
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
              <WorkspaceAvatar
                name={activeWorkspace.name}
                logoUrl={activeWorkspace.logoUrl}
                className="flex h-full w-full items-center justify-center bg-[#E5E7EB]"
                imageClassName="h-full w-full object-contain p-0.5"
                initialsClassName="text-sm font-semibold text-[#1A162F]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900">{activeWorkspace.name}</div>
            </div>
            <CaretDownIcon className="h-3 w-3 text-gray-400 transition-colors group-hover:text-gray-600" />
          </button>
        )
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
                  {showWorkspaceSkeleton ? (
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-5 w-32 rounded-md" />
                        <Skeleton className="h-4 w-20 rounded-md" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm">
                        <WorkspaceAvatar
                          name={activeWorkspace.name}
                          logoUrl={activeWorkspace.logoUrl}
                          className="flex h-full w-full items-center justify-center bg-[#E5E7EB]"
                          imageClassName="h-full w-full object-contain p-1"
                          initialsClassName="text-base font-semibold text-[#1A162F]"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 truncate text-base leading-tight font-bold text-gray-900">{activeWorkspace.name}</div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          {activeWorkspace.members} member{activeWorkspace.members === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                  )}
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
                              <WorkspaceAvatar
                                name={workspace.name}
                                logoUrl={workspace.logoUrl}
                                className="flex h-full w-full items-center justify-center bg-[#E5E7EB]"
                                imageClassName="h-full w-full object-contain p-1"
                                initialsClassName="text-sm font-semibold text-[#1A162F]"
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
  const { checking, gatewayReady, initialized } = useAppState();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [recentTasks, setRecentTasks] = useState<SidebarTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false);
  const [customSessionLabels, setCustomSessionLabels] = useState<Record<string, string>>(() => readCustomSessionLabels());
  const [bustlyUserInfo, setBustlyUserInfo] = useState<BustlyUserInfo | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [hasLoadedWorkspaces, setHasLoadedWorkspaces] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [iconModalOpen, setIconModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [draftScenarioName, setDraftScenarioName] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<SessionIconId>("SquaresFour");
  const [iconPickerMode, setIconPickerMode] = useState<"create" | "edit">("edit");
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsPage = false;
  const isSkillPage = location.pathname === "/skill";
  const effectiveWorkspaceId = activeWorkspaceId || bustlyUserInfo?.workspaceId || "";
  const activeAgentId = useMemo(
    () => buildBustlyWorkspaceAgentId(effectiveWorkspaceId),
    [effectiveWorkspaceId],
  );
  const activeMainSessionKey = useMemo(
    () => buildBustlyWorkspaceMainSessionKey(effectiveWorkspaceId),
    [effectiveWorkspaceId],
  );
  const activeTaskId = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("session") ?? activeMainSessionKey;
  }, [activeMainSessionKey, location.search]);

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
      void loadWorkspaces(true);
    });
    return () => {
      unsubscribe();
    };
  }, [loadWorkspaces]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (checking || !initialized || !gatewayReady) {
      return;
    }

    let disposed = false;
    const clientRef: { current: GatewayBrowserClient | null } = { current: null };
    let requestSettled = false;

    const loadTasks = async () => {
      requestSettled = false;
      if (!disposed) {
        setTasksLoading(!hasLoadedTasks);
      }
      try {
        const status = await window.electronAPI.gatewayStatus();
        if (!status.running) {
          if (!disposed) {
            if (!hasLoadedTasks) {
              setRecentTasks([]);
            }
            setTasksLoading(false);
          }
          return;
        }
        const connectConfig = await window.electronAPI.gatewayConnectConfig();
        if (!connectConfig.token || !connectConfig.wsUrl) {
          if (!disposed) {
            if (!hasLoadedTasks) {
              setRecentTasks([]);
            }
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
                agentId: activeAgentId,
              })
              .then((result) => {
                if (disposed) {
                  return;
                }
                requestSettled = true;
                setRecentTasks(
                  [...result.sessions]
                    .filter((session) => isMainChannelSessionKey(session.key, activeAgentId))
                    .map((session) => ({
                      id: session.key,
                      name: resolveSessionDisplayName(session, customSessionLabels),
                      icon: session.icon,
                      isMain: session.key === activeMainSessionKey,
                    })),
                );
                setHasLoadedTasks(true);
                setTasksLoading(false);
              })
              .catch(() => {
                if (disposed) {
                  return;
                }
                requestSettled = true;
                if (!hasLoadedTasks) {
                  setRecentTasks([]);
                }
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
          if (!hasLoadedTasks) {
            setRecentTasks([]);
          }
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
  }, [
    activeAgentId,
    activeMainSessionKey,
    checking,
    customSessionLabels,
    gatewayReady,
    hasLoadedTasks,
    initialized,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    if (location.pathname !== "/chat") {
      return;
    }
    const searchParams = new URLSearchParams(location.search);
    const fallbackTask = recentTasks[0];
    if (!fallbackTask) {
      return;
    }
    const activeSessionKey = searchParams.get("session");
    if (activeSessionKey && recentTasks.some((task) => task.id === activeSessionKey)) {
      return;
    }
    void navigate(buildChatRoute({ sessionKey: fallbackTask.id, label: fallbackTask.name, icon: fallbackTask.icon }), {
      replace: true,
    });
  }, [location.pathname, location.search, navigate, recentTasks]);

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
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    const result = await window.electronAPI.bustlySetActiveWorkspace(workspaceId, workspace?.name);
    if (!result.success) {
      return;
    }
    setActiveWorkspaceId(workspaceId);
    void navigate("/chat", { replace: true });
    notifySidebarTasksRefresh();
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

  const selectedTask = recentTasks.find((entry) => entry.id === selectedTaskId) ?? null;
  const openCreateModal = () => {
    setDraftScenarioName("");
    setSelectedIcon("SquaresFour");
    setIconPickerMode("create");
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const openRenameModal = (task: SidebarTask) => {
    setSelectedTaskId(task.id);
    setDraftScenarioName(task.name);
    setRenameError(null);
    setRenameModalOpen(true);
  };

  const openIconModal = (task?: SidebarTask) => {
    if (task) {
      setSelectedTaskId(task.id);
      setSelectedIcon((task.icon && SESSION_ICON_OPTIONS.some((option) => option.id === task.icon)) ? (task.icon as SessionIconId) : "SquaresFour");
      setIconPickerMode("edit");
    } else {
      setSelectedTaskId(null);
      setSelectedIcon("SquaresFour");
      setIconPickerMode("create");
    }
    setIconModalOpen(true);
  };

  const handleCreateScenario = async () => {
    const name = draftScenarioName.trim() || "New scenario";
    if (createSaving) {
      return;
    }
    const nextSessionKey = buildChannelSessionKey(activeMainSessionKey);
    setCreateSaving(true);
    setCreateError(null);
    try {
      const result = await window.electronAPI.gatewayPatchSession(nextSessionKey, {
        label: name,
        icon: selectedIcon,
      });
      if (!result.success) {
        setCreateError(result.error ?? "Failed to create scenario.");
        return;
      }
      const nextLabels = { ...customSessionLabels, [nextSessionKey]: name };
      setCustomSessionLabels(nextLabels);
      writeCustomSessionLabels(nextLabels);
      setHasLoadedTasks(true);
      setDraftScenarioName("");
      setSelectedIcon("SquaresFour");
      setCreateModalOpen(false);
      notifySidebarTasksRefresh();
      void navigate(buildChatRoute({ sessionKey: nextSessionKey, label: name, icon: selectedIcon }));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateSaving(false);
    }
  };

  const handleRenameScenario = async () => {
    if (!selectedTaskId) {
      return;
    }
    const name = draftScenarioName.trim();
    if (!name || renameSaving) {
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const result = await window.electronAPI.gatewayPatchSession(selectedTaskId, { label: name });
      if (!result.success) {
        setRenameError(result.error ?? "Failed to save scenario name.");
        return;
      }
      const nextLabels = { ...customSessionLabels, [selectedTaskId]: name };
      setCustomSessionLabels(nextLabels);
      writeCustomSessionLabels(nextLabels);
      setRecentTasks((prev) => prev.map((entry) => (entry.id === selectedTaskId ? { ...entry, name } : entry)));
      setRenameModalOpen(false);
      setSelectedTaskId(null);
      setDraftScenarioName("");
      if (activeTaskId === selectedTaskId) {
        const activeTask = recentTasks.find((entry) => entry.id === selectedTaskId);
        void navigate(
          buildChatRoute({ sessionKey: selectedTaskId, label: name, icon: activeTask?.icon }),
          { replace: true },
        );
      }
      notifySidebarTasksRefresh();
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : String(error));
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDeleteScenario = async () => {
    if (!selectedTask || selectedTask.isMain) {
      setDeleteModalOpen(false);
      setSelectedTaskId(null);
      return;
    }
    try {
      const result = await window.electronAPI.gatewayDeleteSession(selectedTask.id);
      if (!result.success) {
        setDeleteModalOpen(false);
        return;
      }
      const nextLabels = { ...customSessionLabels };
      delete nextLabels[selectedTask.id];
      setCustomSessionLabels(nextLabels);
      writeCustomSessionLabels(nextLabels);
      setRecentTasks((prev) => prev.filter((entry) => entry.id !== selectedTask.id));
      setDeleteModalOpen(false);
      setSelectedTaskId(null);
      if (activeTaskId === selectedTask.id) {
        void navigate("/chat", { replace: true });
      }
      notifySidebarTasksRefresh();
    } catch {
      setDeleteModalOpen(false);
      setSelectedTaskId(null);
    }
  };

  const handleSelectIcon = async (icon: SessionIconId) => {
    if (iconPickerMode === "create") {
      setSelectedIcon(icon);
      setIconModalOpen(false);
      return;
    }
    if (!selectedTaskId) {
      return;
    }
    const result = await window.electronAPI.gatewayPatchSession(selectedTaskId, { icon });
    if (!result.success) {
      return;
    }
    setRecentTasks((prev) => prev.map((entry) => (entry.id === selectedTaskId ? { ...entry, icon } : entry)));
    setIconModalOpen(false);
    setSelectedTaskId(null);
    if (activeTaskId === selectedTaskId) {
      const activeTask = recentTasks.find((entry) => entry.id === selectedTaskId);
      void navigate(
        buildChatRoute({ sessionKey: selectedTaskId, label: activeTask?.name, icon }),
        { replace: true },
      );
    }
    notifySidebarTasksRefresh();
  };

  return (
    <div
      className={`[-webkit-app-region:drag] z-[100] flex h-full flex-col border-r border-white/40 bg-white/30 backdrop-blur-lg transition-all duration-300 ${
        props.collapsed ? "w-20" : "w-64 overflow-x-hidden"
      } ${isWindowFullscreen ? "pt-0" : "pt-[20px]"}`}
    >
      <div
        className={`group relative flex transition-all duration-300 ${
          props.collapsed ? "flex-col items-center gap-4 pt-4 pb-2" : "flex-col gap-2 px-4 pt-4 pb-0"
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
            <div className={`transition-all duration-300 ${props.collapsed ? "flex w-full flex-col items-center gap-2" : "w-full"}`}>
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
        className={`[-webkit-app-region:no-drag] custom-scrollbar flex flex-1 flex-col ${
          props.collapsed ? "items-center overflow-visible" : "overflow-y-auto overflow-x-hidden"
        }`}
      >
        {!props.collapsed ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-0.5 overflow-y-auto px-0 py-4">
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
                      void navigate(buildChatRoute({ sessionKey: task.id, label: task.name, icon: task.icon }));
                    }}
                    onRename={() => {
                      openRenameModal(task);
                    }}
                    onDelete={() => {
                      setSelectedTaskId(task.id);
                      setDeleteModalOpen(true);
                    }}
                    onChangeIcon={() => {
                      openIconModal(task);
                    }}
                  />
                ))
              )}

              <SidebarItem
                icon={Plus}
                label="New scenario"
                active={false}
                onClick={() => {
                  openCreateModal();
                }}
                collapsed={false}
              />
            </div>

            <div className="space-y-1 border-t border-[#E5E7EB] bg-gray-50/30 p-3">
              <SidebarItem
                icon={LightningIcon}
                label="Skills"
                active={isSkillPage}
                onClick={() => {
                  void navigate("/skill");
                }}
                collapsed={false}
                insetClassName="gap-3 px-4 py-2.5"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4">
            <div className="flex w-full flex-1 flex-col items-center gap-3">
              {recentTasks.length > 0 ? (
                <CollapsedScenariosButton
                  tasks={recentTasks}
                  activeTaskId={activeTaskId}
                  onOpenTask={(task) => {
                    void navigate(buildChatRoute({ sessionKey: task.id, label: task.name, icon: task.icon }));
                  }}
                  onRenameClick={openRenameModal}
                  onDeleteClick={(task) => {
                    setSelectedTaskId(task.id);
                    setDeleteModalOpen(true);
                  }}
                  onChangeIcon={(task) => {
                    openIconModal(task);
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => {
                  openCreateModal();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-text-sub transition-all hover:bg-[#1A162F]/5 hover:text-text-main"
                aria-label="New scenario"
                title="New scenario"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-gray-50 transition-colors hover:border-[#1A162F]/10 hover:bg-white">
                  <Plus size={18} weight="bold" />
                </div>
              </button>
            </div>

            <div className="w-full space-y-2 border-t border-[#E5E7EB] px-2 pt-4">
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

      <SidebarModal
        open={createModalOpen}
        title="Create scenario"
        onClose={() => {
          setCreateModalOpen(false);
          setDraftScenarioName("");
          setSelectedIcon("SquaresFour");
          setCreateError(null);
        }}
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="mb-2 block text-sm font-medium text-[#1A162F]">Scenario name</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openIconModal()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E3E7F0] bg-[#F7F8FC] text-[#1A162F] transition-colors hover:border-[#D4D9E6] hover:bg-[#F2F4FA]"
                aria-label="Choose icon"
                title="Choose icon"
              >
                {createElement(getSessionIconComponent(selectedIcon), { size: 20, weight: "bold" })}
              </button>
              <input
                autoFocus
                type="text"
                value={draftScenarioName}
                onChange={(event) => setDraftScenarioName(event.target.value)}
                placeholder="e.g. Supplier finder"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-normal transition-all focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/5"
              />
            </div>
          </div>
          {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              disabled={createSaving}
              onClick={() => {
                setCreateModalOpen(false);
                setDraftScenarioName("");
                setSelectedIcon("SquaresFour");
                setCreateError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#1A162F] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#27223F] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={createSaving}
              onClick={() => {
                void handleCreateScenario();
              }}
            >
              {createSaving ? "Creating..." : "Create scenario"}
            </button>
          </div>
        </div>
      </SidebarModal>

      <SidebarModal
        open={renameModalOpen}
        title="Rename scenario"
        onClose={() => {
          setRenameModalOpen(false);
          setSelectedTaskId(null);
          setDraftScenarioName("");
          setRenameError(null);
        }}
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#1A162F]">Scenario name</label>
            <input
              autoFocus
              type="text"
              value={draftScenarioName}
              onChange={(event) => setDraftScenarioName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleRenameScenario();
                }
                if (event.key === "Escape") {
                  setRenameModalOpen(false);
                  setSelectedTaskId(null);
                  setDraftScenarioName("");
                  setRenameError(null);
                }
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-normal transition-all focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/5"
            />
          </div>
          {renameError ? <p className="text-sm text-red-600">{renameError}</p> : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              disabled={renameSaving}
              onClick={() => {
                setRenameModalOpen(false);
                setSelectedTaskId(null);
                setDraftScenarioName("");
                setRenameError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={renameSaving}
              className="rounded-lg bg-[#1A162F] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#27223F] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleRenameScenario}
            >
              {renameSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </SidebarModal>

      <SidebarModal
        open={iconModalOpen}
        title="Choose icon"
        widthClassName="max-w-md"
        onClose={() => {
          setIconModalOpen(false);
          if (iconPickerMode === "edit") {
            setSelectedTaskId(null);
          }
        }}
      >
        <div className="grid grid-cols-4 gap-2">
          {SESSION_ICON_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = option.id === selectedIcon;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={option.label}
                title={option.label}
                onClick={() => {
                  void handleSelectIcon(option.id);
                }}
                className={`flex h-16 items-center justify-center rounded-2xl border transition-all ${
                  isSelected
                    ? "border-[#1A162F] bg-[#1A162F]/5 shadow-sm"
                    : "border-transparent bg-[#F7F8FC] hover:border-[#1A162F]/10 hover:bg-[#F1F3F8]"
                }`}
              >
                <Icon size={20} weight="bold" className="text-[#1A162F]" />
              </button>
            );
          })}
        </div>
      </SidebarModal>

      <SidebarModal
        open={deleteModalOpen}
        title="Delete scenario"
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedTaskId(null);
        }}
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-gray-600">
            {`Are you sure you want to delete ${selectedTask?.name ? `"${selectedTask.name}"` : "this scenario"}? This action cannot be undone.`}
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              onClick={() => {
                setDeleteModalOpen(false);
                setSelectedTaskId(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              onClick={() => {
                void handleDeleteScenario();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </SidebarModal>
    </div>
  );
}
