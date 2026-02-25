export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export type ChatDisplaySegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "thinking";
      text: string;
    }
  | {
      type: "toolCall";
      toolCallId?: string;
      name: string;
      status: "start" | "completed" | "error";
      summary?: string;
    };

export type ChatDisplayMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  segments: ChatDisplaySegment[];
};
