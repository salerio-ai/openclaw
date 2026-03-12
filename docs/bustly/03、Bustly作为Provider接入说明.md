# Bustly 作为 OpenClaw Provider 接入说明

本文档描述 OpenClaw 当前版本中，`bustly` 作为**唯一模型 Provider**的接入约束、配置结构和排障方法。

## 1. 目标与边界

- OpenClaw 侧只暴露一个 Provider：`bustly`
- 用户选择的模型档位映射为 Gateway route key：
  - `chat.lite`
  - `chat.pro`
  - `chat.max`
- 对 OpenClaw 而言，模型引用统一写成：
  - `bustly/chat.lite`
  - `bustly/chat.pro`
  - `bustly/chat.max`

## 2. 鉴权与工作区来源（单一来源）

Bustly Provider 运行时不依赖 `auth-profiles.json` 中的 token 值，核心凭证来自：

- `~/.bustly/bustlyOauth.json`
  - `user.userAccessToken`：用户 JWT（Bearer Token）
  - `user.workspaceId`：工作区 ID
  - `supabase.url` / `supabase.anonKey`：Supabase 连接信息

请求网关时，OpenClaw 会附带：

- `Authorization: Bearer <user.userAccessToken>`
- `X-Workspace-Id: <user.workspaceId>`
- `User-Agent: <BUSTLY_MODEL_GATEWAY_USER_AGENT>`

## 3. 本地配置文件落盘

OpenClaw 桌面端在登录完成/Provider Setup 完成后，会同步写入：

- `~/.bustly/openclaw.json`

关键配置特征：

1. `auth.profiles` 中仅保留 `bustly:default`（`mode: token`）
2. `auth.order.bustly = ["bustly:default"]`
3. `models.providers` 只包含 `bustly`
4. `agents.defaults.model.primary` 默认 `bustly/chat.lite`
5. `agents.defaults.models` 中只保留三档模型别名（Lite/Pro/Max）

## 4. 调用链路（从登录到发消息）

1. 用户在桌面端发起 Bustly 登录。
2. OAuth/token 交换成功后，桌面端将 Supabase access token 镜像到  
   `bustlyOauth.json -> user.userAccessToken`，并写入 `user.workspaceId`。
3. 桌面端同步 `openclaw.json`，只维护 Provider 基础配置；`X-Workspace-Id` 由运行时从 `bustlyOauth.json` 动态注入。
4. 用户发消息时，模型选择（`bustly/chat.*`）映射到 route key，调用 Bustly Gateway。

## 5. 模型档位与 route key 约定

- OpenClaw 内部模型字符串：`bustly/chat.lite|pro|max`
- Gateway 接收层对应 route key：`chat.lite|pro|max`

兼容输入（用于本地标准化）：

- `lite` / `auto` -> `bustly/chat.lite`
- `pro` -> `bustly/chat.pro`
- `max` -> `bustly/chat.max`

## 6. 环境变量

- `BUSTLY_MODEL_GATEWAY_BASE_URL`：覆盖默认网关地址（默认 `https://gw.bustly.ai/api/v1`）
- `BUSTLY_MODEL_GATEWAY_USER_AGENT`：覆盖请求 `User-Agent`
- `OPENCLAW_STATE_DIR`：覆盖状态目录（桌面默认 `~/.bustly`）
- `OPENCLAW_CONFIG_PATH`：覆盖配置文件路径（桌面默认 `~/.bustly/openclaw.json`）

## 7. 常见问题与排障

### 7.1 报错：No Bustly token found in ~/.bustly/bustlyOauth.json

说明 `user.userAccessToken` 缺失或为空。  
处理：

1. 重新登录 Bustly（桌面端）
2. 检查 `~/.bustly/bustlyOauth.json` 是否存在并包含 `user.userAccessToken`

### 7.2 报错：Only bustly provider is supported.

说明当前桌面集成已限制为 Bustly 单 Provider；请在 Provider Setup 选择/保存 `bustly`。

### 7.3 网关 Dashboard 没有计费流水

优先检查：

1. `openclaw.json -> models.providers.bustly.baseUrl` 是否指向当前测试网关
2. `bustlyOauth.json` 的 `user.workspaceId` 与 JWT 是否匹配
3. 网关侧是否成功落库 `billing_events`

### 7.4 查看 OpenClaw 调用日志

```bash
openclaw logs --follow
```

也可在桌面端日志页面查看 gateway/agent 相关错误。

---

关联文档：

- Provider 说明：`/docs/providers/bustly.md`
- 登录流程：`/docs/bustly/01、SignUp.md`
- OAuth 接口：`/docs/bustly/02、API接口规范.md`
