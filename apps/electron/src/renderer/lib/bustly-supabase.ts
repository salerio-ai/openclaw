import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type WorkspaceMembershipRow = {
  workspace_id: string;
  role: string;
  status: string;
  workspaces:
    | {
        id: string;
        name: string;
        logo_url: string | null;
        status: string;
      }
    | null;
};

type WorkspaceMemberCountRow = {
  workspace_id: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  logoUrl: string | null;
  role: string;
  status: string;
  members: number;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = "";
let cachedConfig: BustlySupabaseConfig | null = null;

async function getSupabaseConfig(): Promise<BustlySupabaseConfig> {
  const config = await window.electronAPI.bustlyGetSupabaseConfig();
  if (!config?.url || !config.anonKey || !config.accessToken || !config.userId) {
    throw new Error("Missing Bustly Supabase config");
  }
  return config;
}

export async function getBustlySupabaseClient(): Promise<{
  client: SupabaseClient;
  config: BustlySupabaseConfig;
}> {
  const config = await getSupabaseConfig();
  const configKey = [config.url, config.anonKey, config.accessToken, config.userId].join("|");
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      },
    });
    cachedConfigKey = configKey;
    cachedConfig = config;
  }
  return {
    client: cachedClient,
    config: cachedConfig ?? config,
  };
}

export async function listWorkspaceSummaries(): Promise<{
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
}> {
  const { client, config } = await getBustlySupabaseClient();
  const membershipRes = await client
    .from("workspace_members")
    .select("workspace_id, role, status, workspaces!inner(id, name, logo_url, status)")
    .eq("user_id", config.userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  if (membershipRes.error) {
    throw membershipRes.error;
  }

  const memberships = (membershipRes.data ?? []) as WorkspaceMembershipRow[];
  const workspaceIds = memberships.map((item) => item.workspace_id).filter(Boolean);
  if (workspaceIds.length === 0) {
    return { workspaces: [], activeWorkspaceId: config.workspaceId };
  }

  const memberCountsRes = await client
    .from("workspace_members")
    .select("workspace_id")
    .in("workspace_id", workspaceIds)
    .eq("status", "ACTIVE");

  if (memberCountsRes.error) {
    throw memberCountsRes.error;
  }

  const memberCounts = new Map<string, number>();
  for (const row of (memberCountsRes.data ?? []) as WorkspaceMemberCountRow[]) {
    memberCounts.set(row.workspace_id, (memberCounts.get(row.workspace_id) ?? 0) + 1);
  }

  const workspaces = memberships
    .map((item) => {
      if (!item.workspaces?.id || !item.workspaces.name) {
        return null;
      }
      return {
        id: item.workspaces.id,
        name: item.workspaces.name,
        logoUrl: item.workspaces.logo_url,
        role: item.role,
        status: item.workspaces.status,
        members: memberCounts.get(item.workspace_id) ?? 0,
      } satisfies WorkspaceSummary;
    })
    .filter((item): item is WorkspaceSummary => Boolean(item))
    .sort((a, b) => {
      if (a.id === config.workspaceId) {
        return -1;
      }
      if (b.id === config.workspaceId) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

  return {
    workspaces,
    activeWorkspaceId: config.workspaceId || workspaces[0]?.id || "",
  };
}
