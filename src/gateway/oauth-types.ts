/**
 * OAuth integration types for Salerio login flow
 */

/**
 * Login initiation request parameters
 */
export type OAuthLoginRequest = {
  client_id: string;
  redirect_uri: string;
  device_id: string;
  login_trace_id: string;
};

/**
 * Login initiation response
 */
export type OAuthLoginResponse = {
  login_url: string;
  login_trace_id: string;
  expires_in: number;
};

/**
 * Token exchange request
 */
export type OAuthTokenRequest = {
  code: string;
  client_id: string;
  grant_type: "authorization_code";
};

/**
 * Token exchange response
 */
export type OAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  skills: string[];
};

/**
 * User status response
 */
export type OAuthUserStatusResponse = {
  logged_in: boolean;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  workspace_id?: string;
  workspace_name?: string;
  skills?: string[];
};

/**
 * Stored OAuth session data
 */
export type OAuthSessionData = {
  login_trace_id: string;
  device_id: string;
  code?: string;
  expires_at: number;
};
