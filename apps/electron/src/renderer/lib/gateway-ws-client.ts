type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { message?: string };
};

type GatewayHelloOk = {
  type: "hello-ok";
  snapshot?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const DEFAULT_GATEWAY_CLIENT_NAME = "webchat-ui";

export class GatewayWsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;

  constructor(
    private readonly options: {
      wsUrl: string;
      token?: string;
      onHello: (hello: GatewayHelloOk) => void;
      onClose: (info: { code: number; reason: string }) => void;
      onEvent: (evt: GatewayEventFrame) => void;
    },
  ) {}

  start() {
    this.ws = new WebSocket(this.options.wsUrl);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      for (const [, req] of this.pending) {
        req.reject(new Error(`gateway closed (${ev.code}): ${reason}`));
      }
      this.pending.clear();
      this.options.onClose({ code: ev.code, reason });
    });
  }

  stop() {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    for (const [, req] of this.pending) {
      req.reject(new Error("gateway client stopped"));
    }
    this.pending.clear();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = crypto.randomUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
    }
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, 200);
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: DEFAULT_GATEWAY_CLIENT_NAME,
        version: "electron",
        platform: navigator.platform ?? "desktop",
        mode: "webchat",
      },
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      auth: this.options.token ? { token: this.options.token } : undefined,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    const hello = await this.request<GatewayHelloOk>("connect", params);
    this.options.onHello(hello);
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      this.options.onEvent(evt);
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "request failed"));
      }
    }
  }
}
