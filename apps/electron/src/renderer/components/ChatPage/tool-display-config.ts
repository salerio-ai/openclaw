export const TOOL_DISPLAY_CONFIG = {
  "version": 1,
  "fallback": {
    "icon": "puzzle",
    "detailKeys": [
      "command",
      "path",
      "url",
      "targetUrl",
      "targetId",
      "ref",
      "element",
      "node",
      "nodeId",
      "id",
      "requestId",
      "to",
      "channelId",
      "guildId",
      "userId",
      "name",
      "query",
      "pattern",
      "messageId"
    ]
  },
  "tools": {
    "exec": {
      "icon": "terminalWindow",
      "title": "Command Execution",
      "detailKeys": ["command"]
    },
    "process": {
      "icon": "cpu",
      "title": "Process Manager",
      "detailKeys": ["sessionId"]
    },
    "read": {
      "icon": "fileText",
      "title": "Read File",
      "detailKeys": ["path"]
    },
    "write": {
      "icon": "penNib",
      "title": "Write File",
      "detailKeys": ["path"]
    },
    "edit": {
      "icon": "pencilSimple",
      "title": "Edit File",
      "detailKeys": ["path"]
    },
    "attach": {
      "icon": "paperclip",
      "title": "Attach",
      "detailKeys": ["path", "url", "fileName"]
    },
    "browser": {
      "icon": "browser",
      "title": "Browser Automation",
      "actions": {
        "status": { "label": "status" },
        "start": { "label": "start" },
        "stop": { "label": "stop" },
        "tabs": { "label": "tabs" },
        "open": { "label": "open", "detailKeys": ["targetUrl"] },
        "focus": { "label": "focus", "detailKeys": ["targetId"] },
        "close": { "label": "close", "detailKeys": ["targetId"] },
        "snapshot": {
          "label": "snapshot",
          "detailKeys": ["targetUrl", "targetId", "ref", "element", "format"]
        },
        "screenshot": {
          "label": "screenshot",
          "detailKeys": ["targetUrl", "targetId", "ref", "element"]
        },
        "navigate": {
          "label": "navigate",
          "detailKeys": ["targetUrl", "targetId"]
        },
        "console": { "label": "console", "detailKeys": ["level", "targetId"] },
        "pdf": { "label": "pdf", "detailKeys": ["targetId"] },
        "upload": {
          "label": "upload",
          "detailKeys": ["paths", "ref", "inputRef", "element", "targetId"]
        },
        "dialog": {
          "label": "dialog",
          "detailKeys": ["accept", "promptText", "targetId"]
        },
        "act": {
          "label": "act",
          "detailKeys": [
            "request.kind",
            "request.ref",
            "request.selector",
            "request.text",
            "request.value"
          ]
        }
      }
    },
    "canvas": {
      "icon": "square",
      "title": "Canvas Control",
      "actions": {
        "present": { "label": "present", "detailKeys": ["target", "node", "nodeId"] },
        "hide": { "label": "hide", "detailKeys": ["node", "nodeId"] },
        "navigate": { "label": "navigate", "detailKeys": ["url", "node", "nodeId"] },
        "eval": { "label": "eval", "detailKeys": ["javaScript", "node", "nodeId"] },
        "snapshot": { "label": "snapshot", "detailKeys": ["format", "node", "nodeId"] },
        "a2ui_push": { "label": "A2UI push", "detailKeys": ["jsonlPath", "node", "nodeId"] },
        "a2ui_reset": { "label": "A2UI reset", "detailKeys": ["node", "nodeId"] }
      }
    },
    "nodes": {
      "icon": "shareNetwork",
      "title": "Node Control",
      "actions": {
        "status": { "label": "status" },
        "describe": { "label": "describe", "detailKeys": ["node", "nodeId"] },
        "pending": { "label": "pending" },
        "approve": { "label": "approve", "detailKeys": ["requestId"] },
        "reject": { "label": "reject", "detailKeys": ["requestId"] },
        "notify": { "label": "notify", "detailKeys": ["node", "nodeId", "title", "body"] },
        "camera_snap": {
          "label": "camera snap",
          "detailKeys": ["node", "nodeId", "facing", "deviceId"]
        },
        "camera_list": { "label": "camera list", "detailKeys": ["node", "nodeId"] },
        "camera_clip": {
          "label": "camera clip",
          "detailKeys": ["node", "nodeId", "facing", "duration", "durationMs"]
        },
        "screen_record": {
          "label": "screen record",
          "detailKeys": ["node", "nodeId", "duration", "durationMs", "fps", "screenIndex"]
        }
      }
    },
    "message": {
      "icon": "chatCircle",
      "title": "Message Channel",
      "detailKeys": ["to", "channelId", "guildId", "userId", "content"]
    },
    "tts": {
      "icon": "speakerHigh",
      "title": "Text to Speech",
      "detailKeys": ["voice", "text"]
    },
    "agents_list": {
      "icon": "listBullets",
      "title": "List Agents",
      "detailKeys": ["scope"]
    },
    "sessions_list": {
      "icon": "listDashes",
      "title": "List Sessions",
      "detailKeys": ["limit", "spawnedBy"]
    },
    "sessions_history": {
      "icon": "clock",
      "title": "Session History",
      "detailKeys": ["sessionId", "limit"]
    },
    "sessions_send": {
      "icon": "paperPlaneRight",
      "title": "Send Message",
      "detailKeys": ["sessionId", "text", "message"]
    },
    "sessions_spawn": {
      "icon": "plusCircle",
      "title": "Spawn Session",
      "detailKeys": ["agent", "model", "sessionId"]
    },
    "subagents": {
      "icon": "robot",
      "title": "Manage Sub-agents",
      "detailKeys": ["id", "action"]
    },
    "session_status": {
      "icon": "pulse",
      "title": "Session Status",
      "detailKeys": ["sessionId", "model"]
    },
    "web_search": {
      "icon": "globe",
      "title": "Web Search",
      "detailKeys": ["query", "q"]
    },
    "web_fetch": {
      "icon": "downloadSimple",
      "title": "Web Fetch",
      "detailKeys": ["url", "targetUrl"]
    },
    "memory_search": {
      "icon": "magnifyingGlass",
      "title": "Memory Search",
      "detailKeys": ["query", "q"]
    },
    "memory_get": {
      "icon": "brain",
      "title": "Get Memory",
      "detailKeys": ["id", "memoryId"]
    },
    "cron": {
      "icon": "loader",
      "title": "Cron",
      "actions": {
        "status": { "label": "status" },
        "list": { "label": "list" },
        "add": {
          "label": "add",
          "detailKeys": ["job.name", "job.id", "job.schedule", "job.cron"]
        },
        "update": { "label": "update", "detailKeys": ["id"] },
        "remove": { "label": "remove", "detailKeys": ["id"] },
        "run": { "label": "run", "detailKeys": ["id"] },
        "runs": { "label": "runs", "detailKeys": ["id"] },
        "wake": { "label": "wake", "detailKeys": ["text", "mode"] }
      }
    },
    "gateway": {
      "icon": "plug",
      "title": "Gateway",
      "actions": {
        "restart": { "label": "restart", "detailKeys": ["reason", "delayMs"] },
        "config.get": { "label": "config get" },
        "config.schema": { "label": "config schema" },
        "config.apply": {
          "label": "config apply",
          "detailKeys": ["restartDelayMs"]
        },
        "update.run": {
          "label": "update run",
          "detailKeys": ["restartDelayMs"]
        }
      }
    },
    "whatsapp_login": {
      "icon": "circle",
      "title": "WhatsApp Login",
      "actions": {
        "start": { "label": "start" },
        "wait": { "label": "wait" }
      }
    },
    "discord": {
      "icon": "chatCircle",
      "title": "Discord",
      "actions": {
        "react": { "label": "react", "detailKeys": ["channelId", "messageId", "emoji"] },
        "reactions": { "label": "reactions", "detailKeys": ["channelId", "messageId"] },
        "sticker": { "label": "sticker", "detailKeys": ["to", "stickerIds"] },
        "poll": { "label": "poll", "detailKeys": ["question", "to"] },
        "permissions": { "label": "permissions", "detailKeys": ["channelId"] },
        "readMessages": { "label": "read messages", "detailKeys": ["channelId", "limit"] },
        "sendMessage": { "label": "send", "detailKeys": ["to", "content"] },
        "editMessage": { "label": "edit", "detailKeys": ["channelId", "messageId"] },
        "deleteMessage": { "label": "delete", "detailKeys": ["channelId", "messageId"] },
        "threadCreate": { "label": "thread create", "detailKeys": ["channelId", "name"] },
        "threadList": { "label": "thread list", "detailKeys": ["guildId", "channelId"] },
        "threadReply": { "label": "thread reply", "detailKeys": ["channelId", "content"] },
        "pinMessage": { "label": "pin", "detailKeys": ["channelId", "messageId"] },
        "unpinMessage": { "label": "unpin", "detailKeys": ["channelId", "messageId"] },
        "listPins": { "label": "list pins", "detailKeys": ["channelId"] },
        "searchMessages": { "label": "search", "detailKeys": ["guildId", "content"] },
        "memberInfo": { "label": "member", "detailKeys": ["guildId", "userId"] },
        "roleInfo": { "label": "roles", "detailKeys": ["guildId"] },
        "emojiList": { "label": "emoji list", "detailKeys": ["guildId"] },
        "roleAdd": { "label": "role add", "detailKeys": ["guildId", "userId", "roleId"] },
        "roleRemove": { "label": "role remove", "detailKeys": ["guildId", "userId", "roleId"] },
        "channelInfo": { "label": "channel", "detailKeys": ["channelId"] },
        "channelList": { "label": "channels", "detailKeys": ["guildId"] },
        "voiceStatus": { "label": "voice", "detailKeys": ["guildId", "userId"] },
        "eventList": { "label": "events", "detailKeys": ["guildId"] },
        "eventCreate": { "label": "event create", "detailKeys": ["guildId", "name"] },
        "timeout": { "label": "timeout", "detailKeys": ["guildId", "userId"] },
        "kick": { "label": "kick", "detailKeys": ["guildId", "userId"] },
        "ban": { "label": "ban", "detailKeys": ["guildId", "userId"] }
      }
    },
    "slack": {
      "icon": "chatCircle",
      "title": "Slack",
      "actions": {
        "react": { "label": "react", "detailKeys": ["channelId", "messageId", "emoji"] },
        "reactions": { "label": "reactions", "detailKeys": ["channelId", "messageId"] },
        "sendMessage": { "label": "send", "detailKeys": ["to", "content"] },
        "editMessage": { "label": "edit", "detailKeys": ["channelId", "messageId"] },
        "deleteMessage": { "label": "delete", "detailKeys": ["channelId", "messageId"] },
        "readMessages": { "label": "read messages", "detailKeys": ["channelId", "limit"] },
        "pinMessage": { "label": "pin", "detailKeys": ["channelId", "messageId"] },
        "unpinMessage": { "label": "unpin", "detailKeys": ["channelId", "messageId"] },
        "listPins": { "label": "list pins", "detailKeys": ["channelId"] },
        "memberInfo": { "label": "member", "detailKeys": ["userId"] },
        "emojiList": { "label": "emoji list" }
      }
    }
  }
};
