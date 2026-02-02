# OpenClaw Electron App - 自动初始化功能

这个 Electron 应用现在已经集成了 OpenClaw 的自动初始化功能，用户打开应用后会自动完成配置并启动 Gateway。

## 功能特性

### 自动初始化

应用启动时会自动：
1. 检查 OpenClaw 是否已初始化（检查 `~/.openclaw/openclaw.json`）
2. 如果未初始化，自动写入默认配置
3. 创建必要的目录（workspace、sessions、credentials）
4. 生成随机 Gateway token
5. 启动 Gateway 进程

### 可配置选项

通过 `PresetConfigOptions` 接口可以自定义初始化配置：

```typescript
interface PresetConfigOptions {
  gatewayPort?: number;        // 默认: 18789
  gatewayBind?: "loopback" | "lan" | "auto";  // 默认: "loopback"
  workspace?: string;          // 默认: "~/.openclaw/workspace"
  authProvider?: "google" | "anthropic" | "openai";  // 默认: "google"
  authMode?: "api_key" | "token";  // 默认: "api_key"
  nodeManager?: "npm" | "pnpm" | "bun";  // 默认: "pnpm"
  slackBotToken?: string;      // 可选
  slackAppToken?: string;      // 可选
}
```

## 使用方法

### 1. 默认配置（推荐）

打开应用后会自动使用默认配置初始化：

```typescript
// 在渲染进程中调用
const result = await window.electronAPI.openclawInit();

console.log(result);
// {
//   success: true,
//   configPath: "/Users/xxx/.openclaw/openclaw.json",
//   gatewayPort: 18789,
//   gatewayToken: "abc123...",
//   gatewayBind: "loopback",
//   workspace: "/Users/xxx/.openclaw/workspace"
// }
```

### 2. 自定义配置

```typescript
const result = await window.electronAPI.openclawInit({
  gatewayPort: 19000,
  authProvider: "anthropic",
  nodeManager: "npm",
  slackBotToken: "xoxb-...",
  slackAppToken: "xapp-...",
});
```

### 3. 强制重新初始化

```typescript
const result = await window.electronAPI.openclawInit({
  force: true,  // 覆盖现有配置
  gatewayPort: 19100,
});
```

### 4. 检查初始化状态

```typescript
const isInitialized = await window.electronAPI.openclawIsInitialized();
console.log("已初始化:", isInitialized);
```

## API 参考

### IPC 通信接口

| 方法 | 参数 | 返回值 |
|------|------|--------|
| `openclawInit` | `options?: PresetConfigOptions` | `Promise<InitializationResult>` |
| `openclawIsInitialized` | - | `Promise<boolean>` |
| `gatewayStart` | - | `Promise<{ success: boolean; error?: string }>` |
| `gatewayStop` | - | `Promise<{ success: boolean; error?: string }>` |
| `gatewayStatus` | - | `Promise<GatewayStatus>` |

### 事件监听

| 事件 | 数据 | 说明 |
|------|------|------|
| `gateway-log` | `{ stream: "stdout" \| "stderr", message: string }` | Gateway 日志输出 |
| `gateway-exit` | `{ code: number \| null, signal: string \| null }` | Gateway 退出 |

```typescript
// 监听 Gateway 日志
const unsubscribe = window.electronAPI.onGatewayLog((data) => {
  console.log(`[${data.stream}]`, data.message);
});

// 停止监听
unsubscribe();
```

## 默认配置说明

### Gateway 配置

- **端口**: 18789
- **绑定地址**: loopback (仅本地访问)
- **认证模式**: token (自动生成)
- **TLS**: 禁用

### Agent 配置

- **工作区**: `~/.openclaw/workspace`
- **并发数**: 4
- **压缩模式**: safeguard

### 模型配置

根据 `authProvider` 不同，默认使用：

| Provider | 默认模型 | 别名 |
|----------|----------|------|
| Google | `google/gemini-2.5-flash-preview` | gemini |
| Anthropic | `anthropic/claude-sonnet-4-20250514` | sonnet |
| OpenAI | 需手动配置 | - |

## 文件结构

```
apps/electron/
├── src/
│   ├── config/
│   │   └── default-config.ts     # 默认配置生成器
│   ├── main/
│   │   ├── auto-init.ts           # 自动初始化模块
│   │   ├── index.ts               # Electron 主进程（已更新）
│   │   └── preload.ts             # IPC API 暴露（已更新）
│   └── renderer/
│       ├── electron.d.ts          # TypeScript 类型定义（已更新）
│       └── ...
```

## 开发提示

### 环境要求

- 从 OpenClaw 仓库根目录运行
- 确保 `openclaw.mjs` 已构建（`pnpm build`）
- 或安装了全局 CLI（`npm install -g .`）

### 调试

查看主进程日志：
```bash
# macOS
~/Library/Logs/OpenClaw/main.log

# 或在开发模式下查看控制台输出
```

### 常见问题

1. **"OpenClaw CLI not found"**
   - 确保从仓库根目录运行
   - 或运行 `pnpm build` 构建 CLI

2. **"No gateway token available"**
   - 先调用 `openclawInit()` 进行初始化
   - 或检查 `~/.openclaw/openclaw.json` 是否存在

3. **配置已存在**
   - 使用 `force: true` 强制重新初始化
   - 或手动删除 `~/.openclaw/openclaw.json`

## 示例代码

完整的 React 示例：

```tsx
import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // 初始化
    window.electronAPI.openclawInit().then(console.log);

    // 监听日志
    const unsubscribe = window.electronAPI.onGatewayLog((data) => {
      setLogs((prev) => [...prev, data]);
    });

    // 定期检查状态
    const interval = setInterval(async () => {
      const s = await window.electronAPI.gatewayStatus();
      setStatus(s);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <h1>OpenClaw Gateway</h1>
      <p>状态: {status?.running ? "运行中" : "已停止"}</p>
      <p>端口: {status?.port}</p>
      <p>WS URL: {status?.wsUrl}</p>
      <pre>{logs.map((log, i) => (
        <div key={i}>[{log.stream}] {log.message}</div>
      ))}</pre>
    </div>
  );
}
```
