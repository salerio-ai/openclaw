export type ChatAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
};

export type ChatQueueItem = {
  id: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  refreshSessions?: boolean;
};

export type TimelineNode =
  | {
      kind: "text";
      key: string;
      timestamp: number;
      text: string;
      tone: "user" | "assistant" | "thinking" | "system";
      streaming?: boolean;
      final?: boolean;
    }
  | {
      kind: "tool";
      key: string;
      timestamp: number;
      mergeKey: string;
      summary: string;
      detail: string;
      hasOutput: boolean;
      completed: boolean;
      running?: boolean;
    }
  | {
      kind: "processed";
      key: string;
      timestamp: number;
      durationMs: number | null;
      items: TimelineNode[];
    }
  | { kind: "divider"; key: string; label: string; timestamp: number };

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type FallbackIndicatorStatus = {
  phase?: "active" | "cleared";
  selected: string;
  active: string;
  previous?: string;
  reason?: string;
  attempts: string[];
  occurredAt: number;
};

export type ChatTimelineContext = {
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  thinkingStream?: string | null;
  streamSeq?: number | null;
  thinkingStreamSeq?: number | null;
  thinkingStreamStartedAt?: number | null;
  thinkingStreamUpdatedAt?: number | null;
  streamStartedAt: number | null;
  streamUpdatedAt?: number | null;
  sessionKey: string;
};
