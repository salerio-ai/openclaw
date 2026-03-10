---
summary: "Use Bustly Model Gateway as the only model provider in OpenClaw"
read_when:
  - You use Bustly gateway instead of direct OpenRouter/OpenAI providers
  - You need to map user model choice to Bustly route keys
title: "Bustly"
---

# Bustly

Bustly provider routes model calls from OpenClaw to the Bustly Model Gateway.
In the current desktop integration, Bustly is the **only** supported provider.

## What this provider exposes

- Provider id: `bustly`
- Default base URL: `https://gw.bustly.ai/api/v1`
- API style: `openai-completions` (OpenAI-compatible Chat Completions path)
- Supported model refs (route keys):
  - `bustly/chat.lite`
  - `bustly/chat.pro`
  - `bustly/chat.max`

The model part (`chat.lite`, `chat.pro`, `chat.max`) is the gateway route key.

## Authentication source of truth

Bustly auth uses local OAuth state, not per-agent API-key storage.

- Token source: `~/.bustly/bustlyOauth.json` -> `user.userAccessToken`
- Workspace source: `~/.bustly/bustlyOauth.json` -> `user.workspaceId`
- Request headers sent to gateway:
  - `Authorization: Bearer <user.userAccessToken>`
  - `X-Workspace-Id: <user.workspaceId>`
  - `User-Agent: <BUSTLY_MODEL_GATEWAY_USER_AGENT>`

If `user.userAccessToken` is missing, model auth resolution fails with:

`No Bustly token found in ~/.bustly/bustlyOauth.json (user.userAccessToken). Please sign in from the Bustly desktop app.`

## Config written by desktop app

After Bustly login / provider setup, OpenClaw writes a bustly-only provider block to
`~/.bustly/openclaw.json`:

```json5
{
  auth: {
    profiles: {
      "bustly:default": { provider: "bustly", mode: "token" },
    },
    order: {
      bustly: ["bustly:default"],
    },
  },
  agents: {
    defaults: {
      model: { primary: "bustly/chat.lite" },
      models: {
        "bustly/chat.lite": { alias: "Lite" },
        "bustly/chat.pro": { alias: "Pro" },
        "bustly/chat.max": { alias: "Max" },
      },
    },
  },
  models: {
    providers: {
      bustly: {
        baseUrl: "https://gw.bustly.ai/api/v1",
        auth: "token",
        api: "openai-completions",
        headers: {
          "User-Agent": "openclaw/2026.2.24",
          "X-Workspace-Id": "<workspace-id>",
        },
        models: [
          { id: "chat.lite", name: "Lite", input: ["text", "image"] },
          { id: "chat.pro", name: "Pro", input: ["text", "image"] },
          { id: "chat.max", name: "Max", input: ["text", "image"] },
        ],
      },
    },
  },
}
```

## Model selection behavior

- Recommended default: `bustly/chat.lite`
- Accepted shorthands are normalized:
  - `lite` / `auto` -> `bustly/chat.lite`
  - `pro` -> `bustly/chat.pro`
  - `max` -> `bustly/chat.max`

## Environment variables

- `BUSTLY_MODEL_GATEWAY_BASE_URL`: override gateway base URL.
- `BUSTLY_MODEL_GATEWAY_USER_AGENT`: override outbound User-Agent.
- `OPENCLAW_STATE_DIR`: override state directory (defaults to `~/.bustly` in desktop mode).
- `OPENCLAW_CONFIG_PATH`: override config path (defaults to `~/.bustly/openclaw.json`).

## Troubleshooting

- `Only bustly provider is supported.`  
  Triggered when trying to onboard/save non-bustly providers in the desktop flow.

- `No Bustly token found...`  
  Sign in again from desktop login; verify `~/.bustly/bustlyOauth.json` contains
  `user.userAccessToken` and `user.workspaceId`.

- Message fails but UI is logged in  
  Confirm `models.providers.bustly.baseUrl` points to the expected gateway environment
  and that gateway accepts the JWT + `X-Workspace-Id` pair.

For deeper integration details, see Bustly docs under `/docs/bustly`.
