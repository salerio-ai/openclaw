/**
 * Gateway methods for OAuth login flow with Salerio
 */

import type { OAuthTokenResponse } from "../../gateway/oauth-types.js";
import type { GatewayRequestHandlers } from "./types.js";
import {
  clearSession,
  exchangeToken,
  generateLoginTraceId,
  generateLoginUrl,
  getStoredCode,
  writeTokenConfig,
} from "../../gateway/oauth-handler.js";
import { ErrorCodes, errorShape } from "../../gateway/protocol/index.js";

export const oauthHandlers: GatewayRequestHandlers = {
  "oauth.login": ({ params, respond }) => {
    console.log("[Gateway oauth.login] Received request, params:", params);
    try {
      const loginTraceId = generateLoginTraceId();
      const redirectUri =
        (params.redirectUri as string | undefined) ?? "http://127.0.0.1:18789/authorize";
      const loginUrl = generateLoginUrl(loginTraceId, redirectUri);

      console.log("[Gateway oauth.login] Generated loginTraceId:", loginTraceId);
      console.log("[Gateway oauth.login] Generated loginUrl:", loginUrl);

      respond(true, { loginUrl, loginTraceId }, undefined);
    } catch (err) {
      console.error("[Gateway oauth.login] Error:", err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  "oauth.poll": async ({ params, respond }) => {
    console.log("[Gateway oauth.poll] Received request, params:", params);
    try {
      const loginTraceId = params.loginTraceId as string | undefined;
      if (!loginTraceId) {
        console.log("[Gateway oauth.poll] Missing loginTraceId");
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "loginTraceId is required"),
        );
        return;
      }

      const code = getStoredCode(loginTraceId);
      console.log("[Gateway oauth.poll] Got code:", !!code);

      if (!code) {
        // Still waiting for callback
        console.log("[Gateway oauth.poll] Still waiting for callback");
        respond(true, { pending: true }, undefined);
        return;
      }

      // Got the code, now exchange for token
      console.log("[Gateway oauth.poll] Exchanging token...");
      const tokenResponse = await exchangeToken(code);
      console.log("[Gateway oauth.poll] Got tokenResponse:", tokenResponse);

      // Write config
      console.log("[Gateway oauth.poll] Writing token config...");
      await writeTokenConfig(tokenResponse);
      console.log("[Gateway oauth.poll] Token config written");

      // Clear the session
      clearSession(loginTraceId);

      respond(true, { pending: false, tokenResponse }, undefined);
    } catch (err) {
      console.error("[Gateway oauth.poll] Error:", err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  "oauth.exchange": async ({ params, respond }) => {
    console.log("[Gateway oauth.exchange] Received request, params:", params);
    try {
      const code = params.code as string | undefined;
      if (!code) {
        console.log("[Gateway oauth.exchange] Missing code");
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "code is required"));
        return;
      }

      const tokenResponse = await exchangeToken(code);
      console.log("[Gateway oauth.exchange] Got tokenResponse:", tokenResponse);

      // Write config
      await writeTokenConfig(tokenResponse);

      respond(true, { tokenResponse }, undefined);
    } catch (err) {
      console.error("[Gateway oauth.exchange] Error:", err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
      );
    }
  },
};
