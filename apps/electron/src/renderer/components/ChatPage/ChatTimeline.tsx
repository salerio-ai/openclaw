import React, { memo, useEffect, useState } from "react";
import Lottie from "lottie-react";
import {
  ArrowsCounterClockwise,
  Brain,
  Browser,
  CaretRight,
  ChatCircle,
  Check,
  CircleNotch,
  Clock,
  Copy,
  Cpu,
  DownloadSimple,
  File,
  FileText,
  Folder,
  Globe,
  Image,
  ListBullets,
  ListDashes,
  MagnifyingGlass,
  NotePencil,
  Paperclip,
  PaperPlaneRight,
  PenNib,
  PlusCircle,
  Plug,
  Pulse,
  PuzzlePiece,
  Robot,
  ShareNetwork,
  SpeakerHigh,
  Square,
  TerminalWindow,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
import loadingAnimation from "../../assets/lottie/thinking.json";
import {
  parseInputArtifactsFromMessage,
  type ChatInputArtifact,
} from "./input-artifacts";
import type { TimelineArtifact, TimelineNode } from "./types";
import { toSanitizedMarkdownHtml } from "./utils";

type ChatTimelineProps = {
  timeline: TimelineNode[];
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
  onRetryRun?: (runId?: string) => void;
  onPreviewImage?: (url: string) => void;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatUserTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hours}:${minutes}`;
}

function formatProcessedDuration(durationMs: number | null | undefined): string {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 1000) {
    return "";
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function ChevronIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <CaretRight size={14} weight="bold" className={cx("transition-transform duration-200", expanded && "rotate-90")} />
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return <CircleNotch size={14} weight="bold" className={cx("animate-spin", className)} />;
}

function UserImageIcon() {
  return <Image size={16} weight="bold" className="h-4 w-4" />;
}

function UserFileIcon() {
  return <File size={16} weight="bold" className="h-4 w-4" />;
}

function UserFolderIcon() {
  return <Folder size={16} weight="bold" className="h-4 w-4" />;
}

function UserArtifactCard({
  artifact,
  onPreviewImage,
}: {
  artifact: ChatInputArtifact | TimelineArtifact;
  onPreviewImage?: (url: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(() =>
    "imageUrl" in artifact ? artifact.imageUrl : undefined,
  );

  useEffect(() => {
    const immediatePreview = "imageUrl" in artifact ? artifact.imageUrl : undefined;
    if (immediatePreview) {
      setPreviewUrl(immediatePreview);
      return;
    }
    if (artifact.kind !== "image" || !artifact.path || typeof window.electronAPI?.resolveChatImagePreview !== "function") {
      setPreviewUrl(undefined);
      return;
    }
    let cancelled = false;
    void window.electronAPI.resolveChatImagePreview(artifact.path).then((resolved) => {
      if (!cancelled) {
        setPreviewUrl(resolved ?? undefined);
      }
    }).catch(() => {
      if (!cancelled) {
        setPreviewUrl(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [artifact]);

  const Icon =
    artifact.kind === "directory"
      ? UserFolderIcon
      : artifact.kind === "image" || ("imageUrl" in artifact && typeof artifact.imageUrl === "string" && artifact.imageUrl.length > 0)
        ? UserImageIcon
        : UserFileIcon;

  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 py-1 pr-1 pl-2 text-xs font-medium text-text-main">
      {previewUrl ? (
        <button
          type="button"
          className="h-5 w-5 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white"
          onClick={() => {
            onPreviewImage?.(previewUrl);
          }}
        >
          <img src={previewUrl} alt={artifact.name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center text-text-sub">
          <Icon />
        </div>
      )}
      <div className="min-w-0 max-w-[220px] truncate" title={artifact.path ?? artifact.name}>
        {artifact.name}
      </div>
    </div>
  );
}

function ToolIcon({ name }: { name: string }) {
  switch (name) {
    case "terminalWindow":
      return <TerminalWindow size={16} weight="bold" className="h-4 w-4" />;
    case "cpu":
      return <Cpu size={16} weight="bold" className="h-4 w-4" />;
    case "fileText":
      return <FileText size={16} weight="bold" className="h-4 w-4" />;
    case "penNib":
      return <PenNib size={16} weight="bold" className="h-4 w-4" />;
    case "pencilSimple":
      return <NotePencil size={16} weight="bold" className="h-4 w-4" />;
    case "edit":
    case "penLine":
      return <NotePencil size={16} weight="bold" className="h-4 w-4" />;
    case "paperclip":
      return <Paperclip size={16} weight="bold" className="h-4 w-4" />;
    case "globe":
      return <Globe size={16} weight="bold" className="h-4 w-4" />;
    case "downloadSimple":
      return <DownloadSimple size={16} weight="bold" className="h-4 w-4" />;
    case "browser":
      return <Browser size={16} weight="bold" className="h-4 w-4" />;
    case "square":
      return <Square size={16} weight="bold" className="h-4 w-4" />;
    case "shareNetwork":
      return <ShareNetwork size={16} weight="bold" className="h-4 w-4" />;
    case "chatCircle":
      return <ChatCircle size={16} weight="bold" className="h-4 w-4" />;
    case "speakerHigh":
      return <SpeakerHigh size={16} weight="bold" className="h-4 w-4" />;
    case "listBullets":
      return <ListBullets size={16} weight="bold" className="h-4 w-4" />;
    case "listDashes":
      return <ListDashes size={16} weight="bold" className="h-4 w-4" />;
    case "clock":
      return <Clock size={16} weight="bold" className="h-4 w-4" />;
    case "paperPlaneRight":
      return <PaperPlaneRight size={16} weight="bold" className="h-4 w-4" />;
    case "plusCircle":
      return <PlusCircle size={16} weight="bold" className="h-4 w-4" />;
    case "robot":
      return <Robot size={16} weight="bold" className="h-4 w-4" />;
    case "pulse":
      return <Pulse size={16} weight="bold" className="h-4 w-4" />;
    case "magnifyingGlass":
      return <MagnifyingGlass size={16} weight="bold" className="h-4 w-4" />;
    case "brain":
      return <Brain size={16} weight="bold" className="h-4 w-4" />;
    case "image":
      return <Image size={16} weight="bold" className="h-4 w-4" />;
    case "smartphone":
      return <PuzzlePiece size={16} weight="bold" className="h-4 w-4" />;
    case "loader":
      return <SpinnerIcon className="h-4 w-4" />;
    case "plug":
      return <Plug size={16} weight="bold" className="h-4 w-4" />;
    case "circle":
      return <Check size={16} weight="bold" className="h-4 w-4" />;
    case "messageSquare":
      return <NotePencil size={16} weight="bold" className="h-4 w-4" />;
    case "wrench":
      return <Wrench size={16} weight="bold" className="h-4 w-4" />;
    case "puzzle":
    default:
      return <PuzzlePiece size={16} weight="bold" className="h-4 w-4" />;
  }
}

function markdownClassName(isErrorText: boolean) {
  return cx(
    "text-sm leading-7 text-gray-900",
    isErrorText && "text-red-600",
    "[&_a]:text-[#1A162F] [&_a]:underline [&_a]:underline-offset-2",
    "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500",
    "[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
    "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-gray-200 [&_pre]:bg-gray-50 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-6",
    "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
    "[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold",
    "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold",
    "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold",
    "[&_hr]:my-4 [&_hr]:border-gray-200",
    "[&_img]:my-3 [&_img]:max-h-[28rem] [&_img]:rounded-2xl [&_img]:border [&_img]:border-gray-200",
    "[&_li]:my-1",
    "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
    "[&_p]:my-1",
    "[&_table]:my-3 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:rounded-xl [&_table]:border [&_table]:border-gray-200",
    "[&_td]:border-r [&_td]:border-b [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
    "[&_th]:border-r [&_th]:border-b [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
    "[&_tr>*:last-child]:border-r-0",
    "[&_tbody_tr:last-child>*]:border-b-0",
    "[&_thead_tr:first-child_th:first-child]:rounded-tl-xl",
    "[&_thead_tr:first-child_th:last-child]:rounded-tr-xl",
    "[&_tbody_tr:last-child_td:first-child]:rounded-bl-xl",
    "[&_tbody_tr:last-child_td:last-child]:rounded-br-xl",
    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
  );
}

function isProcessNode(node: TimelineNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === "tool" || node.kind === "processed") {
    return true;
  }
  return (
    node.kind === "text" &&
    (node.tone === "thinking" || (node.tone === "assistant" && (node.streaming || !node.final)))
  );
}

function shouldTightJoin(prev: TimelineNode | null, next: TimelineNode | null): boolean {
  if (!prev || !next) {
    return false;
  }
  return isProcessNode(prev) && isProcessNode(next);
}

const StreamFoldNode = memo(function StreamFoldNode({
  node,
  activeRunningToolKey,
  onCopyText,
  onRetryRun,
  onPreviewImage,
}: {
  node: Extract<TimelineNode, { kind: "streamFold" }>;
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
  onRetryRun?: (runId?: string) => void;
  onPreviewImage?: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stepLabel = `${node.hiddenCount} step${node.hiddenCount === 1 ? "" : "s"} hidden`;

  if (expanded) {
    return (
      <TimelineStack
        items={node.items}
        activeRunningToolKey={activeRunningToolKey}
        onCopyText={onCopyText}
        onRetryRun={onRetryRun}
        onPreviewImage={onPreviewImage}
      />
    );
  }

  return (
    <div className="py-2 pl-11">
      {!expanded ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
          }}
          className="group flex w-full items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#D8DCE7] bg-[#FBFBFD] px-4 py-3 text-center transition-colors hover:border-[#C5CBD9] hover:bg-[#F7F8FC]"
        >
          <div className="flex items-center gap-1 opacity-50 transition-opacity group-hover:opacity-100">
            <div className="h-1.5 w-1.5 rounded-full bg-[#666F8D]/60" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#666F8D]/60" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#666F8D]/60" />
          </div>
          <span className="text-[15px] font-medium tracking-[-0.01em] text-[#66708F]">
            {stepLabel} (click to expand)
          </span>
        </button>
      ) : null}

    </div>
  );
});

const ErrorStateNode = memo(function ErrorStateNode({
  node,
  onRetryRun,
}: {
  node: Extract<TimelineNode, { kind: "errorState" }>;
  onRetryRun?: (runId?: string) => void;
}) {
  return (
    <div className="mt-4 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-4 rounded-2xl border border-red-100 bg-red-50/50 p-5">
        <div className="flex items-center gap-2 text-red-600">
          <WarningCircle size={20} weight="bold" />
          <span className="text-sm font-semibold tracking-tight">Execution Failed</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] font-medium text-text-main">
            Reason: <span className="ml-1 font-mono text-red-600/80">{node.reason}</span>
          </div>
          <div className="text-[13px] leading-relaxed text-text-sub">{node.description}</div>
        </div>

        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onRetryRun?.(node.runId);
            }}
            className="flex items-center gap-2 rounded-xl bg-text-main px-4 py-2 text-xs font-medium text-white transition-all hover:bg-text-main/90 active:scale-95"
          >
            <ArrowsCounterClockwise size={14} weight="bold" />
            Retry Now
          </button>
        </div>
      </div>
    </div>
  );
});

async function copyText(text: string, onCopyText?: (text: string) => void) {
  if (onCopyText) {
    onCopyText(text);
    return;
  }
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard write failures should not break the timeline UI.
  }
}

const TextNode = memo(function TextNode({
  node,
  onCopyText,
  onPreviewImage,
}: {
  node: Extract<TimelineNode, { kind: "text" }>;
  onCopyText?: (text: string) => void;
  onPreviewImage?: (url: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, 1200);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [copied]);

  if (node.tone === "user") {
    const timeLabel = formatUserTime(node.timestamp);
    const parsed = parseInputArtifactsFromMessage(node.text);
    const artifacts = node.artifacts ?? parsed.artifacts;
    return (
      <div className="group/user flex flex-col items-end">
        {artifacts.length > 0 ? (
          <div className="mb-2 flex max-w-[85%] flex-wrap justify-end gap-2">
            {artifacts.map((artifact, index) => (
              <UserArtifactCard
                key={`${artifact.kind}:${artifact.name}:${artifact.path ?? index}`}
                artifact={artifact}
                onPreviewImage={onPreviewImage}
              />
            ))}
          </div>
        ) : null}
        <div className="flex max-w-[85%] flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
          {parsed.text ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900" dir="auto">
              {parsed.text}
            </div>
          ) : null}
        </div>
        <div className="mt-1.5 flex min-h-[24px] items-center gap-2 px-1">
          <button
            type="button"
            aria-label="Copy message"
            className="rounded-md p-1 text-gray-500 opacity-0 transition hover:bg-gray-100 hover:text-gray-900 group-hover/user:opacity-100"
            onClick={async () => {
              void copyText(node.text, onCopyText);
              setCopied(true);
            }}
          >
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
          </button>
          {timeLabel ? <span className="text-[11px] font-medium text-gray-400">{timeLabel}</span> : null}
        </div>
      </div>
    );
  }

  const isErrorText = /^(error:|err:)/i.test(node.text.trim());
  if (node.tone === "thinking") {
    return (
      <div className={cx("relative animate-in fade-in slide-in-from-left-2 duration-500 pl-11", node.streaming && "opacity-90")}>
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-[26px] top-0 z-0 w-[2px]"
          style={{
            backgroundImage: "linear-gradient(to bottom, #E5E7EB 50%, transparent 50%)",
            backgroundSize: "2px 8px",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          className={cx(markdownClassName(isErrorText), "relative z-10 !text-gray-500")}
          dangerouslySetInnerHTML={{ __html: toSanitizedMarkdownHtml(node.text) }}
        />
      </div>
    );
  }

  if (node.tone === "assistant" && !node.final) {
    return (
      <div className="pl-3">
        <div
          className={markdownClassName(isErrorText)}
          dangerouslySetInnerHTML={{ __html: toSanitizedMarkdownHtml(node.text) }}
        />
      </div>
    );
  }

  return (
    <div
      className={cx(
        "animate-in fade-in slide-in-from-bottom-2 duration-500",
        node.streaming && "opacity-95",
        node.final && "pb-1",
      )}
    >
      <div
        className={markdownClassName(isErrorText)}
        dangerouslySetInnerHTML={{ __html: toSanitizedMarkdownHtml(node.text) }}
      />
    </div>
  );
});

const ToolNode = memo(function ToolNode({
  node,
  activeRunningToolKey,
}: {
  node: Extract<TimelineNode, { kind: "tool" }>;
  activeRunningToolKey: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const running = node.running && node.key === activeRunningToolKey;

  return (
    <div className="relative flex flex-col">
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[26px] top-[54px] z-0 w-[2px]"
        style={{
          backgroundImage: "linear-gradient(to bottom, #E5E7EB 50%, transparent 50%)",
          backgroundSize: "2px 8px",
          backgroundRepeat: "repeat-y",
        }}
      />

      <div className="relative z-10 flex flex-col">
        <button
          type="button"
          className="group mb-1 mt-1 flex items-center gap-3 text-left"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          <div className="relative flex-1 rounded-xl transition-colors hover:bg-white">
            <div
              className={cx(
                "absolute inset-0 rounded-xl transition-colors",
                expanded ? "bg-[#1A162F]/5" : "bg-transparent group-hover:bg-[#1A162F]/5",
              )}
            />

            <div className="relative flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-900">
                  <ToolIcon name={node.icon ?? "puzzle"} />
                </div>
                <span className="text-sm font-semibold text-gray-900">{node.label ?? node.summary}</span>
                <div className="flex h-3.5 w-3.5 items-center justify-center">
                  {running ? <SpinnerIcon className="text-gray-500" /> : null}
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-500">
                <ChevronIcon expanded={expanded} />
              </div>
            </div>
          </div>
        </button>

        <div
          className={cx(
            "ml-11 overflow-hidden transition-all duration-300 ease-in-out",
            expanded ? "mb-4 max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{node.detail}</pre>
          </div>
        </div>
      </div>
    </div>
  );
});

const ProcessedNode = memo(function ProcessedNode({
  node,
  activeRunningToolKey,
  onRetryRun,
}: {
  node: Extract<TimelineNode, { kind: "processed" }>;
  activeRunningToolKey: string | null;
  onRetryRun?: (runId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const duration = formatProcessedDuration(node.durationMs);
  const summary = duration
    ? `${node.items.length} steps processed in ${duration}`
    : `${node.items.length} steps processed`;

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 text-left transition-colors hover:bg-gray-100"
        onClick={() => {
          setExpanded((value) => !value);
        }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A162F]/5 text-[#1A162F]">
          <Check size={16} weight="bold" className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900">Execution Completed</div>
          <div className="text-xs text-gray-500">{summary}</div>
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      <div
        className={cx(
          "overflow-hidden transition-all duration-300 ease-in-out",
          expanded ? "mt-4 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div>
          <TimelineStack items={node.items} activeRunningToolKey={activeRunningToolKey} onRetryRun={onRetryRun} />
        </div>
      </div>
    </div>
  );
});

const DividerNode = memo(function DividerNode({ node }: { node: Extract<TimelineNode, { kind: "divider" }> }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" data-ts={String(node.timestamp)}>
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{node.label}</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
});

function TimelineStack({
  items,
  activeRunningToolKey,
  onCopyText,
  onRetryRun,
  onPreviewImage,
  spaced = false,
}: {
  items: TimelineNode[];
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
  onRetryRun?: (runId?: string) => void;
  onPreviewImage?: (url: string) => void;
  spaced?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {items.map((node, index) => {
        const prev = index > 0 ? items[index - 1] : null;
        const needsLooseSpacing = spaced && index > 0 && !shouldTightJoin(prev, node);
        return (
          <div key={node.key} className={cx(needsLooseSpacing && "mt-4")}>
            <TimelineItem
              node={node}
              activeRunningToolKey={activeRunningToolKey}
              onCopyText={onCopyText}
              onRetryRun={onRetryRun}
              onPreviewImage={onPreviewImage}
            />
          </div>
        );
      })}
    </div>
  );
}

const TimelineItem = memo(function TimelineItem({
  node,
  activeRunningToolKey,
  onCopyText,
  onRetryRun,
  onPreviewImage,
}: {
  node: TimelineNode;
  activeRunningToolKey: string | null;
  onCopyText?: (text: string) => void;
  onRetryRun?: (runId?: string) => void;
  onPreviewImage?: (url: string) => void;
}) {
  switch (node.kind) {
    case "text":
      return <TextNode node={node} onCopyText={onCopyText} onPreviewImage={onPreviewImage} />;
    case "tool":
      return <ToolNode node={node} activeRunningToolKey={activeRunningToolKey} />;
    case "processed":
      return <ProcessedNode node={node} activeRunningToolKey={activeRunningToolKey} onRetryRun={onRetryRun} />;
    case "errorState":
      return <ErrorStateNode node={node} onRetryRun={onRetryRun} />;
    case "streamFold":
      return (
        <StreamFoldNode
          node={node}
          activeRunningToolKey={activeRunningToolKey}
          onCopyText={onCopyText}
          onRetryRun={onRetryRun}
          onPreviewImage={onPreviewImage}
        />
      );
    case "divider":
      return <DividerNode node={node} />;
    default:
      return null;
  }
});

function WaitingLiveIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 animate-in fade-in duration-500">
      <div className="flex h-4 w-4 items-center justify-center overflow-hidden">
        <Lottie animationData={loadingAnimation} loop style={{ width: 20, height: 20 }} className="scale-[0.8]" />
      </div>
      <span className="text-[14px] font-medium tracking-tight text-gray-500">{label}</span>
    </div>
  );
}

export const ChatTimeline = memo(function ChatTimeline({
  timeline,
  activeRunningToolKey,
  onCopyText,
  onRetryRun,
  onPreviewImage,
}: ChatTimelineProps) {
  return (
    <TimelineStack
      items={timeline}
      activeRunningToolKey={activeRunningToolKey}
      onCopyText={onCopyText}
      onRetryRun={onRetryRun}
      onPreviewImage={onPreviewImage}
      spaced
    />
  );
});

export const ChatTimelineWaitingIndicator = memo(function ChatTimelineWaitingIndicator({
  label,
}: {
  label: string;
}) {
  return <WaitingLiveIndicator label={label} />;
});
