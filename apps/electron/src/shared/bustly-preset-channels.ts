import type { SessionIconId } from "../renderer/lib/session-icons.js";

export type BustlyPresetChannel = {
  slug: string;
  label: string;
  icon: SessionIconId;
  order: number;
  enabled?: boolean;
  model?: string;
};

export const BUSTLY_PRESET_CHANNELS: BustlyPresetChannel[] = [
  {
    slug: "daily-ops",
    label: "Daily Ops",
    icon: "Storefront",
    order: 10,
  },
  {
    slug: "campaigns",
    label: "Campaigns",
    icon: "Tag",
    order: 20,
  },
  {
    slug: "inventory",
    label: "Inventory",
    icon: "Package",
    order: 30,
  },
  {
    slug: "support",
    label: "Support",
    icon: "User",
    order: 40,
  },
];
