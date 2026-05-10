export type StoryFilterId =
  | "original"
  | "vivid"
  | "cinema"
  | "noir"
  | "warm"
  | "cool";

export interface StoryFilterPreset {
  id: StoryFilterId;
  label: string;
  cssFilter: string;
  overlay: string;
}

export interface StoryMusicPreset {
  id: string;
  label: string;
  description: string;
  color: string;
}

export const STORY_FILTER_PRESETS: StoryFilterPreset[] = [
  {
    id: "original",
    label: "Original",
    cssFilter: "none",
    overlay: "transparent",
  },
  {
    id: "vivid",
    label: "Vivid",
    cssFilter: "saturate(1.28) contrast(1.08)",
    overlay: "linear-gradient(180deg, rgba(74,222,128,0.08), transparent 45%)",
  },
  {
    id: "cinema",
    label: "Cinema",
    cssFilter: "contrast(1.13) saturate(0.92) brightness(0.96)",
    overlay:
      "linear-gradient(180deg, rgba(0,0,0,0.14), transparent 28%, rgba(0,0,0,0.16))",
  },
  {
    id: "noir",
    label: "Noir",
    cssFilter: "grayscale(1) contrast(1.18) brightness(0.94)",
    overlay: "transparent",
  },
  {
    id: "warm",
    label: "Warm",
    cssFilter: "sepia(0.22) saturate(1.14) contrast(1.04)",
    overlay: "linear-gradient(180deg, rgba(250,204,21,0.1), transparent 55%)",
  },
  {
    id: "cool",
    label: "Cool",
    cssFilter: "saturate(1.08) hue-rotate(348deg) contrast(1.04)",
    overlay: "linear-gradient(180deg, rgba(56,189,248,0.1), transparent 55%)",
  },
];

export const STORY_MUSIC_PRESETS: StoryMusicPreset[] = [
  {
    id: "none",
    label: "No music",
    description: "Clean story audio",
    color: "#94a3b8",
  },
  {
    id: "pulse",
    label: "Pulse",
    description: "Generated soft beat",
    color: "#4ade80",
  },
  {
    id: "glow",
    label: "Glow",
    description: "Generated airy loop",
    color: "#38bdf8",
  },
  {
    id: "afterhours",
    label: "Afterhours",
    description: "Generated mellow bass",
    color: "#facc15",
  },
];

export const getStoryFilterPreset = (filterId?: string | null) =>
  STORY_FILTER_PRESETS.find((filter) => filter.id === filterId) ||
  STORY_FILTER_PRESETS[0];

export const getStoryMusicPreset = (musicId?: string | null) =>
  STORY_MUSIC_PRESETS.find((music) => music.id === musicId) ||
  STORY_MUSIC_PRESETS[0];
