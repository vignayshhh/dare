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

export interface StoryGeneratedMusicPattern {
  notes: number[];
  tempo: number;
  type: OscillatorType;
  gain?: number;
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
  {
    id: "sunset",
    label: "Sunset",
    description: "Generated warm synth pop",
    color: "#fb7185",
  },
  {
    id: "drift",
    label: "Drift",
    description: "Generated laid-back keys",
    color: "#60a5fa",
  },
  {
    id: "horizon",
    label: "Horizon",
    description: "Generated bright drive loop",
    color: "#34d399",
  },
  {
    id: "ember",
    label: "Ember",
    description: "Generated night pulse",
    color: "#f97316",
  },
  {
    id: "mint",
    label: "Mint",
    description: "Generated light pluck groove",
    color: "#2dd4bf",
  },
  {
    id: "starlight",
    label: "Starlight",
    description: "Generated dreamy bell line",
    color: "#c084fc",
  },
  {
    id: "rally",
    label: "Rally",
    description: "Generated upbeat bounce",
    color: "#f59e0b",
  },
];

export const STORY_GENERATED_MUSIC_PATTERNS: Record<
  string,
  StoryGeneratedMusicPattern
> = {
  pulse: { notes: [196, 247, 294, 247], tempo: 320, type: "sine", gain: 0.42 },
  glow: {
    notes: [330, 392, 494, 587],
    tempo: 520,
    type: "triangle",
    gain: 0.38,
  },
  afterhours: {
    notes: [110, 147, 165, 147],
    tempo: 420,
    type: "sine",
    gain: 0.48,
  },
  sunset: {
    notes: [262, 330, 392, 440],
    tempo: 360,
    type: "triangle",
    gain: 0.4,
  },
  drift: {
    notes: [220, 262, 294, 330],
    tempo: 460,
    type: "sawtooth",
    gain: 0.28,
  },
  horizon: {
    notes: [294, 370, 440, 554],
    tempo: 300,
    type: "square",
    gain: 0.26,
  },
  ember: {
    notes: [130.81, 174.61, 196, 174.61],
    tempo: 390,
    type: "sine",
    gain: 0.46,
  },
  mint: {
    notes: [392, 440, 392, 523.25],
    tempo: 280,
    type: "triangle",
    gain: 0.34,
  },
  starlight: {
    notes: [523.25, 659.25, 587.33, 783.99],
    tempo: 540,
    type: "triangle",
    gain: 0.22,
  },
  rally: {
    notes: [246.94, 329.63, 392, 329.63],
    tempo: 250,
    type: "square",
    gain: 0.24,
  },
};

export function createGeneratedStoryMusicPlayer(
  musicId: string,
  options?: { masterGain?: number; noteDurationMs?: number },
) {
  const AudioContextCtor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : null;

  if (!AudioContextCtor || musicId === "none") return null;

  const pattern =
    STORY_GENERATED_MUSIC_PATTERNS[musicId] ||
    STORY_GENERATED_MUSIC_PATTERNS.pulse;
  const context = new AudioContextCtor();
  const master = context.createGain();
  const noteDurationMs = options?.noteDurationMs ?? 240;
  master.gain.value = options?.masterGain ?? 0.04;
  master.connect(context.destination);

  let step = 0;

  const playNote = () => {
    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const noteDuration = noteDurationMs / 1000;
    const peakGain = pattern.gain ?? 0.4;

    oscillator.type = pattern.type;
    oscillator.frequency.value = pattern.notes[step % pattern.notes.length];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + Math.max(0.12, noteDuration - 0.02),
    );

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + noteDuration);
    step += 1;
  };

  playNote();
  const timer = window.setInterval(playNote, pattern.tempo);

  return {
    stop: () => {
      window.clearInterval(timer);
      void context.close();
    },
  };
}

export const getStoryFilterPreset = (filterId?: string | null) =>
  STORY_FILTER_PRESETS.find((filter) => filter.id === filterId) ||
  STORY_FILTER_PRESETS[0];

export const getStoryMusicPreset = (musicId?: string | null) =>
  STORY_MUSIC_PRESETS.find((music) => music.id === musicId) ||
  STORY_MUSIC_PRESETS[0];
