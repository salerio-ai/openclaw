export type BustlySearchDataConfig = {
  SEARCH_DATA_TOKEN: string;
  SEARCH_DATA_SUPABASE_URL: string;
  SEARCH_DATA_SUPABASE_ANON_KEY: string;
  SEARCH_DATA_SUPABASE_ACCESS_TOKEN: string;
  SEARCH_DATA_WORKSPACE_ID: string;
};

export type BustlyOAuthUser = {
  userId: string;
  userName: string;
  userEmail: string;
  workspaceId: string;
  skills: string[];
};

export type BustlyOAuthState = {
  loginTraceId?: string;
  deviceId: string;
  callbackPort: number;
  authCode?: string;
  expiresAt?: number;
  user?: BustlyOAuthUser;
  loggedInAt?: number;
  bustlySearchData?: BustlySearchDataConfig;
};
