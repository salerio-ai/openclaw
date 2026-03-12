import type { Api, Model } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../../config/config.js";
import type { ModelDefinitionConfig } from "../../config/types.js";
import { readBustlyOAuthState } from "../../bustly-oauth.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
import { DEFAULT_CONTEXT_TOKENS } from "../defaults.js";
import { buildModelAliasLines } from "../model-alias-lines.js";
import { normalizeModelCompat } from "../model-compat.js";
import { resolveForwardCompatModel } from "../model-forward-compat.js";
import { normalizeProviderId } from "../model-selection.js";
import {
  discoverAuthStorage,
  discoverModels,
  type AuthStorage,
  type ModelRegistry,
} from "../pi-model-discovery.js";

type InlineModelEntry = ModelDefinitionConfig & {
  provider: string;
  baseUrl?: string;
};
type InlineProviderConfig = {
  baseUrl?: string;
  api?: ModelDefinitionConfig["api"];
  headers?: Record<string, string>;
  models?: ModelDefinitionConfig[];
};

export { buildModelAliasLines };

const BUSTLY_PROVIDER_ID = "bustly";
const BUSTLY_WORKSPACE_HEADER = "X-Workspace-Id";

function applyBustlyWorkspaceHeader(
  providerId: string,
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (normalizeProviderId(providerId) !== BUSTLY_PROVIDER_ID) {
    if (!headers || Object.keys(headers).length === 0) {
      return undefined;
    }
    return headers;
  }
  const workspaceId = readBustlyOAuthState()?.user?.workspaceId?.trim() ?? "";
  const nextHeaders = { ...(headers ?? {}) };
  if (workspaceId) {
    nextHeaders[BUSTLY_WORKSPACE_HEADER] = workspaceId;
  } else {
    delete nextHeaders[BUSTLY_WORKSPACE_HEADER];
  }
  return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
}

function withRuntimeProviderHeaders(providerId: string, model: Model<Api>): Model<Api> {
  const headers = applyBustlyWorkspaceHeader(providerId, model.headers as Record<string, string> | undefined);
  if (!headers) {
    const { headers: _headers, ...rest } = model as Model<Api> & { headers?: unknown };
    return rest as Model<Api>;
  }
  return {
    ...model,
    headers,
  };
}

export function buildInlineProviderModels(
  providers: Record<string, InlineProviderConfig>,
): InlineModelEntry[] {
  return Object.entries(providers).flatMap(([providerId, entry]) => {
    const trimmed = providerId.trim();
    if (!trimmed) {
      return [];
    }
    return (entry?.models ?? []).map((model) => {
      const mergedHeaders = {
        ...entry?.headers,
        ...model.headers,
      };
      const runtimeHeaders = applyBustlyWorkspaceHeader(trimmed, mergedHeaders);
      return {
        ...model,
        ...(runtimeHeaders ? { headers: runtimeHeaders } : {}),
        provider: trimmed,
        baseUrl: entry?.baseUrl,
        api: model.api ?? entry?.api,
      };
    });
  });
}

export function resolveModel(
  provider: string,
  modelId: string,
  agentDir?: string,
  cfg?: OpenClawConfig,
): {
  model?: Model<Api>;
  error?: string;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
} {
  const resolvedAgentDir = agentDir ?? resolveOpenClawAgentDir();
  const authStorage = discoverAuthStorage(resolvedAgentDir);
  const modelRegistry = discoverModels(authStorage, resolvedAgentDir);
  const model = modelRegistry.find(provider, modelId) as Model<Api> | null;

  if (!model) {
    const providers = cfg?.models?.providers ?? {};
    const inlineModels = buildInlineProviderModels(providers);
    const normalizedProvider = normalizeProviderId(provider);
    const inlineMatch = inlineModels.find(
      (entry) => normalizeProviderId(entry.provider) === normalizedProvider && entry.id === modelId,
    );
    if (inlineMatch) {
      const normalized = normalizeModelCompat(inlineMatch as Model<Api>);
      return {
        model: withRuntimeProviderHeaders(provider, normalized),
        authStorage,
        modelRegistry,
      };
    }
    // Forward-compat fallbacks must be checked BEFORE the generic providerCfg fallback.
    // Otherwise, configured providers can default to a generic API and break specific transports.
    const forwardCompat = resolveForwardCompatModel(provider, modelId, modelRegistry);
    if (forwardCompat) {
      return { model: forwardCompat, authStorage, modelRegistry };
    }
    // OpenRouter is a pass-through proxy — any model ID available on OpenRouter
    // should work without being pre-registered in the local catalog.
    if (normalizedProvider === "openrouter") {
      const fallbackModel: Model<Api> = normalizeModelCompat({
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider,
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: DEFAULT_CONTEXT_TOKENS,
        // Align with OPENROUTER_DEFAULT_MAX_TOKENS in models-config.providers.ts
        maxTokens: 8192,
      } as Model<Api>);
      return { model: fallbackModel, authStorage, modelRegistry };
    }
    const providerCfg = providers[provider];
    if (providerCfg || modelId.startsWith("mock-")) {
      const fallbackModel: Model<Api> = normalizeModelCompat({
        id: modelId,
        name: modelId,
        api: providerCfg?.api ?? "openai-responses",
        provider,
        baseUrl: providerCfg?.baseUrl,
        headers: applyBustlyWorkspaceHeader(provider, providerCfg?.headers),
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: providerCfg?.models?.[0]?.contextWindow ?? DEFAULT_CONTEXT_TOKENS,
        maxTokens: providerCfg?.models?.[0]?.maxTokens ?? DEFAULT_CONTEXT_TOKENS,
      } as Model<Api>);
      return {
        model: withRuntimeProviderHeaders(provider, fallbackModel),
        authStorage,
        modelRegistry,
      };
    }
    return {
      error: buildUnknownModelError(provider, modelId),
      authStorage,
      modelRegistry,
    };
  }
  return {
    model: withRuntimeProviderHeaders(provider, normalizeModelCompat(model)),
    authStorage,
    modelRegistry,
  };
}

/**
 * Build a more helpful error when the model is not found.
 *
 * Local providers (ollama, vllm) need a dummy API key to be registered.
 * Users often configure `agents.defaults.model.primary: "ollama/…"` but
 * forget to set `OLLAMA_API_KEY`, resulting in a confusing "Unknown model"
 * error.  This detects known providers that require opt-in auth and adds
 * a hint.
 *
 * See: https://github.com/openclaw/openclaw/issues/17328
 */
const LOCAL_PROVIDER_HINTS: Record<string, string> = {
  ollama:
    "Ollama requires authentication to be registered as a provider. " +
    'Set OLLAMA_API_KEY="ollama-local" (any value works) or run "openclaw configure". ' +
    "See: https://docs.openclaw.ai/providers/ollama",
  vllm:
    "vLLM requires authentication to be registered as a provider. " +
    'Set VLLM_API_KEY (any value works) or run "openclaw configure". ' +
    "See: https://docs.openclaw.ai/providers/vllm",
};

function buildUnknownModelError(provider: string, modelId: string): string {
  const base = `Unknown model: ${provider}/${modelId}`;
  const hint = LOCAL_PROVIDER_HINTS[provider.toLowerCase()];
  return hint ? `${base}. ${hint}` : base;
}
