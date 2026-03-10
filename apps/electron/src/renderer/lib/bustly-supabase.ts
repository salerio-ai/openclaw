import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type WorkspaceMembershipRow = {
  workspace_id: string;
  role: string;
  status: string;
  created_at: string;
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

type WorkspaceSubscriptionRow = {
  workspace_id: string;
  status: string;
  current_period_end: string | null;
  end_at: string | null;
  updated_at: string;
  benefit_plan:
    | {
        code: string | null;
        name: string | null;
        tier: string | null;
      }
    | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  logoUrl: string | null;
  role: string;
  status: string;
  members: number;
  plan: string | null;
  expired: boolean;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = "";

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
  const configKey = [
    config.url,
    config.anonKey,
    config.accessToken,
    config.userId,
    config.workspaceId,
  ].join("|");
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
  }
  return {
    client: cachedClient,
    config,
  };
}

export async function listWorkspaceSummaries(): Promise<{
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
}> {
  const { client, config } = await getBustlySupabaseClient();
  const membershipRes = await client
    .from("workspace_members")
    .select("workspace_id, role, status, created_at, workspaces!inner(id, name, logo_url, status)")
    .eq("user_id", config.userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

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

  const subscriptionRes = await client
    .from("workspace_subscriptions")
    .select("workspace_id, status, current_period_end, end_at, updated_at, benefit_plan(code, name, tier)")
    .in("workspace_id", workspaceIds)
    .order("updated_at", { ascending: false });

  if (subscriptionRes.error) {
    throw subscriptionRes.error;
  }

  const latestSubscriptionByWorkspace = new Map<string, WorkspaceSubscriptionRow>();
  for (const row of (subscriptionRes.data ?? []) as WorkspaceSubscriptionRow[]) {
    if (!latestSubscriptionByWorkspace.has(row.workspace_id)) {
      latestSubscriptionByWorkspace.set(row.workspace_id, row);
    }
  }

  const workspaces = memberships
    .map((item) => {
      if (!item.workspaces?.id || !item.workspaces.name) {
        return null;
      }
      const subscription = latestSubscriptionByWorkspace.get(item.workspace_id);
      const effectiveEndAt = subscription?.end_at || subscription?.current_period_end;
      const expired =
        subscription?.status === "expired" ||
        (subscription?.status === "canceled" &&
          typeof effectiveEndAt === "string" &&
          Number.isFinite(Date.parse(effectiveEndAt)) &&
          Date.parse(effectiveEndAt) <= Date.now());
      const planLabel = (subscription?.benefit_plan?.code ||
        subscription?.benefit_plan?.name ||
        subscription?.benefit_plan?.tier ||
        "")
        .trim()
        .toUpperCase();
      return {
        id: item.workspaces.id,
        name: item.workspaces.name,
        logoUrl: item.workspaces.logo_url,
        role: item.role,
        status: item.workspaces.status,
        members: memberCounts.get(item.workspace_id) ?? 0,
        plan: planLabel || null,
        expired,
      } satisfies WorkspaceSummary;
    })
    .filter((item): item is WorkspaceSummary => Boolean(item));

  return {
    workspaces,
    activeWorkspaceId: config.workspaceId || workspaces[0]?.id || "",
  };
}
