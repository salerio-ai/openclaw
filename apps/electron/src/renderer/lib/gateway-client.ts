import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity";
import { clearDeviceAuthToken, storeDeviceAuthToken } from "./device-auth-store";

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: string;
  instanceId?: string;
  onHello?: (hello: unknown) => void;
  onEvent?: (event: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string; error?: { code: string; message: string; details?: unknown } }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "GatewayRequestError";
    this.gatewayCode = code;
    this.details = details;
  }
}

export class GatewayClientStoppedError extends Error {
  constructor() {
    super("gateway client stopped");
    this.name = "GatewayClientStoppedError";
  }
}

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private closed = false;
  private connectNonce: string | null = null;
  private connectSent = false;
  private lastSeq: number | null = null;
  private reconnectBackoffMs = 800;
  private connectTimer: number | null = null;
  private pendingConnectError: { code: string; message: string; details?: unknown } | undefined;

  constructor(private readonly options: GatewayBrowserClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.connectTimer != null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPending(new GatewayClientStoppedError());
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const frame = { type: "req", id, method, params };
    return await new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      ws.send(JSON.stringify(frame));
    });
  }

  private connect() {
    if (this.closed) {
      return;
    }
    this.ws = new WebSocket(this.options.url);
    this.connectSent = false;
    this.connectNonce = null;

    this.ws.addEventListener("open", () => this.queueConnectHandshake());
    this.ws.addEventListener("message", (event) => this.handleMessage(String(event.data ?? "")));
    this.ws.addEventListener("close", (event) => {
      const reason = String(event.reason ?? "");
      const wasClosed = this.closed;
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${event.code}): ${reason}`));
      if (!wasClosed) {
        this.options.onClose?.({ code: event.code, reason, error: this.pendingConnectError });
      }
      this.pendingConnectError = undefined;
      if (!wasClosed) {
        this.scheduleReconnect();
      }
    });
    this.ws.addEventListener("error", () => {
      // Close handler will report details.
    });
  }

  private queueConnectHandshake() {
    if (this.connectTimer != null) {
      window.clearTimeout(this.connectTimer);
    }
    // Some gateways send connect.challenge, some accept immediate connect.
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.reconnectBackoffMs;
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.7, 15_000);
    window.setTimeout(() => this.connect(), delay);
  }

  private flushPending(error: Error) {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer != null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    try {
      const role = "operator";
      const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
      let authToken = this.options.token;
      // let canFallbackToShared = false;

      const hasWebCrypto = typeof crypto !== "undefined" && !!crypto.subtle;
      let deviceIdentity:
        | {
            deviceId: string;
            publicKey: string;
            privateKey: string;
          }
        | null = null;

      if (hasWebCrypto) {
        deviceIdentity = await loadOrCreateDeviceIdentity();
      }

      let device:
        | {
            id: string;
            publicKey: string;
            signature: string;
            signedAt: number;
            nonce: string;
          }
        | undefined;

      if (hasWebCrypto && deviceIdentity) {
        const signedAtMs = Date.now();
        const payload = [
          "v2",
          deviceIdentity.deviceId,
          this.options.clientName ?? "openclaw-control-ui",
          this.options.mode ?? "webchat",
          role,
          scopes.join(","),
          String(signedAtMs),
          authToken ?? "",
          this.connectNonce ?? "",
        ].join("|");
        const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
        device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce: this.connectNonce ?? "",
        };
      }

      const hello = await this.request("connect", {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: this.options.clientName ?? "openclaw-control-ui",
          version: this.options.clientVersion ?? "dev",
          platform: this.options.platform ?? navigator.platform ?? "web",
          mode: this.options.mode ?? "webchat",
          instanceId: this.options.instanceId,
        },
        role,
        scopes,
        device,
        caps: ["tool-events"],
        auth:
          authToken || this.options.password
            ? {
                token: authToken,
                password: this.options.password,
              }
            : undefined,
        userAgent: navigator.userAgent,
        locale: navigator.language,
      });
      const helloRecord = (hello ?? {}) as {
        auth?: { deviceToken?: string; role?: string; scopes?: string[] };
      };
      if (helloRecord.auth?.deviceToken && deviceIdentity) {
        storeDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role: helloRecord.auth.role ?? role,
          token: helloRecord.auth.deviceToken,
          scopes: helloRecord.auth.scopes ?? [],
        });
      }
      this.reconnectBackoffMs = 800;
      this.options.onHello?.(hello);
    } catch (error) {
      if (error instanceof GatewayClientStoppedError || this.closed) {
        return;
      }
      if (error instanceof GatewayRequestError) {
        this.pendingConnectError = {
          code: error.gatewayCode,
          message: error.message,
          details: error.details,
        };
        if (error.gatewayCode === "unauthorized.device_token_rejected") {
          // Retry once with shared token by clearing cached device token.
          // We only know deviceId inside this scope if identity is available on this run.
          try {
            const hasWebCrypto = typeof crypto !== "undefined" && !!crypto.subtle;
            if (hasWebCrypto) {
              const identity = await loadOrCreateDeviceIdentity();
              clearDeviceAuthToken({ deviceId: identity.deviceId, role: "operator" });
            }
          } catch {
            // best effort
          }
        }
      } else {
        this.pendingConnectError = {
          code: "connect_failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      console.error("[gateway-client] connect failed:", error);
      this.ws?.close(4008, "connect failed");
    }
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const maybe = parsed as { type?: unknown };
    if (maybe.type === "event") {
      const event = parsed as GatewayEventFrame;
      if (event.event === "connect.challenge") {
        const payload = event.payload as { nonce?: unknown } | undefined;
        this.connectNonce = typeof payload?.nonce === "string" ? payload.nonce : null;
        void this.sendConnect();
        return;
      }
      const seq = typeof event.seq === "number" ? event.seq : null;
      if (seq != null) {
        if (this.lastSeq != null && seq > this.lastSeq + 1) {
          this.options.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      this.options.onEvent?.(event);
      return;
    }

    if (maybe.type === "res") {
      const response = parsed as GatewayResponseFrame;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        const code = response.error?.code ?? "gateway_error";
        const message = response.error?.message ?? "Request failed";
        pending.reject(new GatewayRequestError(code, message, response.error?.details));
      }
    }
  }
}
