# OpenClaw Electron Desktop Client

An Electron + React desktop client for OpenClaw that starts and manages the gateway process.

## Features

- **Gateway Process Management**: Start/stop the OpenClaw gateway directly from the UI
- **WebSocket Connection**: Automatically connects to the gateway WebSocket when running
- **Real-time Logs**: View gateway stdout/stderr logs in real-time
- **Cross-platform**: Works on macOS, Windows, and Linux (Node 22+ compatible)

## Development

```bash
# Install dependencies
bun install

# Run development mode (starts Vite dev server + Electron)
bun run dev
```

## Building

```bash
# Build for production
bun run build

# The output will be in:
# - dist/main/index.js - Main Electron process
# - dist/main/preload.js - Preload script
# - dist/renderer/ - React app
```

## Project Structure

```
apps/electron/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # Main entry point
│   │   └── preload.ts  # Preload script
│   └── renderer/       # React UI
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       └── styles.css
├── dist/               # Build output
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Architecture

```
┌─────────────────────────────────────────────┐
│         Electron Main Process               │
│  - Manages gateway process (spawn/kill)     │
│  - IPC handlers for renderer communication  │
│  - Window management                        │
└────────────────┬────────────────────────────┘
                 │ IPC + WebSocket events
┌────────────────▼────────────────────────────┐
│         React Renderer Process              │
│  - Start/Stop gateway buttons              │
│  - Real-time logs display                  │
│  - WebSocket client for gateway            │
└────────────────┬────────────────────────────┘
                 │ WebSocket
┌────────────────▼────────────────────────────┐
│           OpenClaw Gateway                  │
│  (started as child process by Electron)     │
└─────────────────────────────────────────────┘
```

## Next Steps

To extend this client:

1. **Add Gateway RPC Support**: Implement the gateway's RPC protocol to call methods like `chat`, `listChannels`, etc.

2. **Add Chat Interface**: Create a chat UI that communicates with the gateway via WebSocket

3. **Add Channel Management**: UI to configure and manage messaging channels

4. **Add Config Editor**: UI to edit `$OPENCLAW_CONFIG_PATH` (default: `$OPENCLAW_STATE_DIR/openclaw.json`)

5. **Add System Tray**: Minimize to system tray with menu options

## Protocol

The client communicates with the gateway using:
- **IPC** (Inter-Process Communication) between Electron main and renderer
- **WebSocket** between Electron and gateway (`ws://127.0.0.1:17999`)

See the gateway protocol documentation for details on WebSocket messages.
