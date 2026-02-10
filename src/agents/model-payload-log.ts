import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Api, AssistantMessageEventStream, Model } from "@mariozechner/pi-ai";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { resolveUserPath } from "../utils.js";
import { parseBooleanValue } from "../utils/boolean.js";

type PayloadLogEvent = {
  ts: string;
  stage: "response";
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  workspaceDir?: string;
  payload?: unknown;
  payloadDigest?: string;
};

type PayloadLogConfig = {
  enabled: boolean;
  filePath: string;
  providers?: Set<string>;
};

type PayloadLogWriter = {
  filePath: string;
  write: (line: string) => void;
};

const writers = new Map<string, PayloadLogWriter>();

function resolvePayloadLogConfig(env: NodeJS.ProcessEnv): PayloadLogConfig {
  const enabled = parseBooleanValue(env.OPENCLAW_PAYLOAD_LOG) ?? false;
  const fileOverride = env.OPENCLAW_PAYLOAD_LOG_FILE?.trim();
  const filePath = fileOverride
    ? resolveUserPath(fileOverride)
    : path.join(resolveStateDir(env), "logs", "model-payload.jsonl");
  const providerList = env.OPENCLAW_PAYLOAD_LOG_PROVIDERS?.trim();
  const providers = providerList
    ? new Set(
        providerList
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      )
    : undefined;
  return { enabled, filePath, providers };
}

function getWriter(filePath: string): PayloadLogWriter {
  const existing = writers.get(filePath);
  if (existing) {
    return existing;
  }

  const dir = path.dirname(filePath);
  const ready = fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  let queue = Promise.resolve();

  const writer: PayloadLogWriter = {
    filePath,
    write: (line: string) => {
      queue = queue
        .then(() => ready)
        .then(() => fs.appendFile(filePath, line, "utf8"))
        .catch(() => undefined);
    },
  };

  writers.set(filePath, writer);
  return writer;
}

function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") {
        return val.toString();
      }
      if (typeof val === "function") {
        return "[Function]";
      }
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (val instanceof Uint8Array) {
        return { type: "Uint8Array", data: Buffer.from(val).toString("base64") };
      }
      return val;
    });
  } catch {
    return null;
  }
}

function digest(value: unknown): string | undefined {
  const serialized = safeJsonStringify(value);
  if (!serialized) {
    return undefined;
  }
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export type ModelPayloadLogger = {
  enabled: true;
  wrapStreamFn: (streamFn: StreamFn) => StreamFn;
};

export function createModelPayloadLogger(params: {
  env?: NodeJS.ProcessEnv;
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  workspaceDir?: string;
}): ModelPayloadLogger | null {
  const env = params.env ?? process.env;
  const cfg = resolvePayloadLogConfig(env);
  if (!cfg.enabled) {
    return null;
  }

  const writer = getWriter(cfg.filePath);
  const base: Omit<PayloadLogEvent, "ts" | "stage"> = {
    runId: params.runId,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    provider: params.provider,
    modelId: params.modelId,
    modelApi: params.modelApi,
    workspaceDir: params.workspaceDir,
  };

  const record = (event: PayloadLogEvent) => {
    const line = safeJsonStringify(event);
    if (!line) {
      return;
    }
    writer.write(`${line}\n`);
  };

  const wrapStreamFn: ModelPayloadLogger["wrapStreamFn"] = (streamFn) => {
    const wrapped: StreamFn = (model, context, options) => {
      const provider = (model as Model<Api> | null | undefined)?.provider;
      if (cfg.providers && provider && !cfg.providers.has(provider)) {
        return streamFn(model, context, options);
      }
      const modelSummary = model
        ? {
            id: (model as Model<Api>).id,
            provider: (model as Model<Api>).provider,
            api: (model as Model<Api>).api,
            baseUrl: (model as Model<Api>).baseUrl,
          }
        : null;

      const wrapStream = (stream: AssistantMessageEventStream): AssistantMessageEventStream => {
        let logged = false;
        const recordResponse = (payload: unknown) => {
          if (logged) {
            return;
          }
          logged = true;
          record({
            ...base,
            ts: new Date().toISOString(),
            stage: "response",
            payload: {
              model: modelSummary,
              message: payload,
            },
            payloadDigest: digest(payload),
          });
        };

        const wrappedStream = Object.create(stream) as AssistantMessageEventStream;
        wrappedStream[Symbol.asyncIterator] = async function* () {
          for await (const event of stream) {
            if (event.type === "done") {
              recordResponse(event.message);
            } else if (event.type === "error") {
              recordResponse(event.error);
            }
            yield event;
          }
        };
        wrappedStream.result = async () => {
          const result = await stream.result();
          recordResponse(result);
          return result;
        };
        return wrappedStream;
      };

      const response = streamFn(model, context, options);
      if (
        response &&
        typeof (response as Promise<AssistantMessageEventStream>).then === "function"
      ) {
        return (response as Promise<AssistantMessageEventStream>).then(wrapStream);
      }
      return wrapStream(response as AssistantMessageEventStream);
    };
    return wrapped;
  };

  return { enabled: true, wrapStreamFn };
}
