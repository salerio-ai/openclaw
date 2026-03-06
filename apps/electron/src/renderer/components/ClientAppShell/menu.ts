export type ClientAppMenuItem = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  enabled: boolean;
};

export const CLIENT_APP_MENU: ClientAppMenuItem[] = [
  {
    key: "chat",
    label: "Chat",
    shortLabel: "C",
    description: "Current workspace chat",
    enabled: true,
  },
  {
    key: "home",
    label: "Home",
    shortLabel: "H",
    description: "Client dashboard",
    enabled: false,
  },
  {
    key: "skill",
    label: "Skill",
    shortLabel: "S",
    description: "Prompt workflows",
    enabled: false,
  },
  {
    key: "channels",
    label: "Channels",
    shortLabel: "Ch",
    description: "Connected channels",
    enabled: false,
  },
  {
    key: "settings",
    label: "Settings",
    shortLabel: "Se",
    description: "Workspace settings",
    enabled: false,
  },
];
