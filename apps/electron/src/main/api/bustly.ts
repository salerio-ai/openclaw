import { existsSync, readFileSync } from "node:fs";
import * as os from "node:os";
import { resolve } from "node:path";
import type { BustlyOAuthState } from "../bustly-types.js";

export type SupabaseUserResponse = {
  id?: string;
  email?: string;
  role?: string;
};

export type SupabaseVerifyResult = {
  ok: boolean;
  status: number;
  data?: SupabaseUserResponse;
};

export type SupabaseFetchParams = {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: BodyInit;
};

function resolveUserPath(input: string, homeDir: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    return resolve(trimmed.replace(/^~(?=$|[\\/])/, homeDir));
  }
  return resolve(trimmed);
}

function resolveStateDir(): string {
  const homeDir = os.homedir();
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, homeDir);
  }
  return resolve(homeDir, ".bustly");
}

function resolveBustlyOauthFile(): string {
  return resolve(resolveStateDir(), "bustlyOauth.json");
}

function readBustlyOAuthState(): BustlyOAuthState | null {
  try {
    const oauthFile = resolveBustlyOauthFile();
    if (!existsSync(oauthFile)) {
      return null;
    }
    const content = readFileSync(oauthFile, "utf-8");
    return JSON.parse(content) as BustlyOAuthState;
  } catch {
    return null;
  }
}

function getSupabaseAuthConfig() {
  const state = readBustlyOAuthState();
  const supabaseUrl = state?.supabase?.url?.trim() ?? "";
  const supabaseAnonKey = state?.supabase?.anonKey?.trim() ?? "";
  const accessToken = state?.user?.userAccessToken?.trim() ?? "";
  return { supabaseUrl, supabaseAnonKey, accessToken };
}

export async function supabaseFetch(params: SupabaseFetchParams): Promise<Response> {
  const { supabaseUrl, supabaseAnonKey, accessToken } = getSupabaseAuthConfig();
  if (!accessToken) {
    throw new Error("Missing Supabase access token");
  }
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL");
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing Supabase anon key");
  }
  if (!params.path) {
    throw new Error("Missing Supabase path");
  }
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/${params.path.replace(/^\/+/, "")}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    apikey: supabaseAnonKey,
    ...params.headers,
  };

  console.log("[Supabase API] Request:", params.method ?? "GET", endpoint);
  return fetch(endpoint, {
    method: params.method ?? "GET",
    headers,
    body: params.body,
  });
}

export async function verifySupabaseAuth(): Promise<SupabaseVerifyResult> {
  const response = await supabaseFetch({
    path: "/auth/v1/user",
    method: "GET",
  });
  console.log("[Supabase API] Verify auth response:", response.status, response.statusText);
  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const data = (await response.json()) as SupabaseUserResponse;
  console.log("[Supabase API] Verify auth user:", data.id ?? "unknown");
  return { ok: true, status: response.status, data };
}
