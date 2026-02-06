export type BustlyVerifyResponse = {
  code: string;
  message: string;
  status: string;
  data?: {
    userInfo?: {
      id: string;
      email: string;
      userName: string;
    };
    workspace?: {
      id: string;
      name: string;
      logoUrl: string | null;
      role: string;
    };
    workspacePlan?: {
      planId: string;
      planName: string;
      planCode: string;
      tier: string;
      status: string;
      startAt: string;
      trialEndAt?: string;
      currentPeriodStart?: string;
      currentPeriodEnd?: string;
      cancelAtPeriodEnd?: boolean;
      currency?: string;
      billingCycle?: string;
      provider?: string;
    };
  };
};

export type BustlyVerifyResult = {
  ok: boolean;
  status: number;
  data?: BustlyVerifyResponse;
};

export async function verifyBustlyAuth(params: {
  accessToken: string;
  workspaceId: string;
}): Promise<BustlyVerifyResult> {
  const apiBaseUrl = process.env.BUSTLY_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error("Missing BUSTLY_API_BASE_URL");
  }

  const apiEndpoint = `${apiBaseUrl.replace(/\/+$/, "")}/api/auth/verify`;
  const webBaseUrl = process.env.BUSTLY_WEB_BASE_URL;

  console.log("[Bustly API] Verify auth request");
  console.log("[Bustly API] Endpoint:", apiEndpoint);
  console.log(
    "[Bustly API] Workspace:",
    params.workspaceId,
    "Token:",
    params.accessToken ? params.accessToken.slice(0, 10) + "..." : "MISSING",
  );

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${params.accessToken}`,
    "X-Workspace-Id": params.workspaceId,
  };

  if (webBaseUrl) {
    const normalizedWebBaseUrl = webBaseUrl.replace(/\/+$/, "");
    headers.Origin = normalizedWebBaseUrl;
    headers.Referer = `${normalizedWebBaseUrl}/`;
  }

  const response = await fetch(apiEndpoint, { headers });
  console.log("[Bustly API] Verify auth response:", response.status, response.statusText);
  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const data = (await response.json()) as BustlyVerifyResponse;
  console.log(
    "[Bustly API] Verify auth body:",
    "code",
    data.code,
    "status",
    data.status,
    "message",
    data.message,
  );
  return { ok: true, status: response.status, data };
}
