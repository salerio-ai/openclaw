import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type PlatformCategory = "commerce" | "advertising" | "communication" | "sourcing";

type PlatformCode =
  | "SHOPIFY"
  | "BIGCOMMERCE"
  | "WOOCOMMERCE"
  | "MAGENTO"
  | "ADOBE_COMMERCE"
  | "GOOGLE_ADS"
  | "META_ADS"
  | "SLACK"
  | "ALIEXPRESS";

type IntegrationRow = {
  id: number;
  platform: PlatformCode;
  status: string | null;
  connected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
  status: string | null;
  owner_id: string | null;
};

type MembershipRow = {
  role: string | null;
};

type ConnectedPlatform = {
  platform: PlatformCode;
  label: string;
  category: PlatformCategory;
  connectedAt: string | null;
  integrationStatus: string | null;
};

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workspace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLATFORM_META: Record<PlatformCode, { label: string; category: PlatformCategory }> = {
  SHOPIFY: { label: "Shopify", category: "commerce" },
  BIGCOMMERCE: { label: "BigCommerce", category: "commerce" },
  WOOCOMMERCE: { label: "WooCommerce", category: "commerce" },
  MAGENTO: { label: "Magento", category: "commerce" },
  ADOBE_COMMERCE: { label: "Adobe Commerce", category: "commerce" },
  GOOGLE_ADS: { label: "Google Ads", category: "advertising" },
  META_ADS: { label: "Meta Ads", category: "advertising" },
  SLACK: { label: "Slack", category: "communication" },
  ALIEXPRESS: { label: "AliExpress", category: "sourcing" },
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const fallbackMessage =
      typeof record.error === "string"
        ? record.error
        : typeof record.details === "string"
          ? record.details
          : typeof record.hint === "string"
            ? record.hint
            : JSON.stringify(record);

    return {
      message: typeof record.message === "string" ? record.message : fallbackMessage,
      code: typeof record.code === "string" ? record.code : undefined,
      details: record.details,
      hint: typeof record.hint === "string" ? record.hint : undefined,
    };
  }

  return { message: String(error) };
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isConnectedIntegration(row: IntegrationRow) {
  const status = normalizeStatus(row.status);
  return status !== "inactive" && status !== "deleted" && status !== "suspended" && status !== "error" && status !== "failed";
}

function pickLatestIntegration(rows: IntegrationRow[], platform: PlatformCode) {
  return (
    rows
      .filter((row) => row.platform === platform)
      .sort((a, b) => {
        const aTime = a.updated_at ?? a.created_at ?? "";
        const bTime = b.updated_at ?? b.created_at ?? "";
        return bTime.localeCompare(aTime);
      })[0] ?? null
  );
}

function createUserClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
    },
  });
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAuthorizedWorkspace(params: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  workspaceId: string;
}): Promise<{ workspace: WorkspaceRow; role: string }> {
  const { data: workspace, error: workspaceError } = await params.service
    .from("workspaces")
    .select("id, name, status, owner_id")
    .eq("id", params.workspaceId)
    .maybeSingle<WorkspaceRow>();

  if (workspaceError) {
    throw workspaceError;
  }
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.owner_id === params.userId) {
    return { workspace, role: "OWNER" };
  }

  const { data: membership, error: membershipError } = await params.service
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("status", "ACTIVE")
    .maybeSingle<MembershipRow>();

  if (membershipError) {
    throw membershipError;
  }
  if (!membership) {
    throw new Error("Workspace access denied");
  }

  return { workspace, role: membership.role ?? "MEMBER" };
}

async function loadIntegrations(service: ReturnType<typeof createServiceClient>, workspaceId: string) {
  const { data, error } = await service
    .from("workspace_integrations")
    .select("id, platform, status, connected_at, created_at, updated_at")
    .eq("workspace_id", workspaceId);

  if (error) {
    throw error;
  }

  return (data ?? []) as IntegrationRow[];
}

function buildConnectedPlatforms(integrations: IntegrationRow[]): ConnectedPlatform[] {
  const platforms = Object.keys(PLATFORM_META) as PlatformCode[];

  return platforms
    .map((platform) => {
      const latest = pickLatestIntegration(integrations, platform);
      if (!latest || !isConnectedIntegration(latest)) {
        return null;
      }

      const meta = PLATFORM_META[platform];
      return {
        platform,
        label: meta.label,
        category: meta.category,
        connectedAt: latest.connected_at,
        integrationStatus: latest.status,
      } satisfies ConnectedPlatform;
    })
    .filter((platform): platform is ConnectedPlatform => platform !== null);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Only POST is supported" }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspace_id ?? req.headers.get("x-workspace-id") ?? "").trim();
    if (!workspaceId) {
      return json({ error: "workspace_id is required" }, { status: 400 });
    }

    const userClient = createUserClient(req);
    const service = createServiceClient();
    const token = req.headers.get("Authorization")?.replace(/^Bearer\\s+/i, "").trim() ?? "";
    if (!token) {
      return json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);
    if (userError) {
      throw userError;
    }
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace, role } = await requireAuthorizedWorkspace({
      service,
      userId: user.id,
      workspaceId,
    });

    const integrations = await loadIntegrations(service, workspaceId);
    const connectedPlatforms = buildConnectedPlatforms(integrations);

    return json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        role,
      },
      connectedPlatforms,
    });
  } catch (error) {
    const details = safeError(error);
    console.error("workspace-platform-status error", details);
    const status =
      details.message === "Workspace access denied"
        ? 403
        : details.message === "Workspace not found"
          ? 404
          : 500;

    return json(
      {
        error: details.message,
        details,
      },
      { status },
    );
  }
});
