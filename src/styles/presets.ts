export const DEFAULT_IMAGEN_MODEL = 'gemini-2.5-flash-image';

export type StyleKey =
  | 'linkedin'
  | 'cartoon'
  | 'cinematic'
  | 'vintage'
  | 'artistic';

export interface StylePreset {
  key: StyleKey;
  label: string;
  prompt: string;
  aspectRatio?: string;
  model?: string;
  captionTemplate: string;
}

export const STYLE_PRESETS: Record<StyleKey, StylePreset> = {
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn Professional Headshot',
    prompt:
      'Using the provided image, create a polished, professional LinkedIn-style headshot with even studio lighting, a soft neutral background, and realistic color grading. Keep the person\'s identity and features intact. The person should be wearing professional attire.',
    aspectRatio: '3:4',
    captionTemplate: "Here's your LinkedIn-ready portrait.",
  },
  cartoon: {
    key: 'cartoon',
    label: 'Cartoon / Anime',
    prompt:
      'Using the provided image, transform this person into a vibrant cartoon or anime character with bold outlines, expressive eyes, and bright colors. Keep the person recognizable but with stylized cartoon features.',
    aspectRatio: '1:1',
    captionTemplate: 'Cartoon mode activated!',
  },
  cinematic: {
    key: 'cinematic',
    label: 'Cinematic Portrait',
    prompt:
      'Using the provided image, restyle this portrait as a cinematic movie still with dramatic lighting, shallow depth of field, rich contrast, and tasteful color grading. Create a mood similar to a professional movie poster.',
    aspectRatio: '3:4',
    captionTemplate: 'Cinematic flair, coming right up.',
  },
  vintage: {
    key: 'vintage',
    label: 'Vintage Film',
    prompt:
      'Using the provided image, render this portrait with warm 35mm film tones, gentle grain, and a subtle retro vignette inspired by 1970s photography. Give it an authentic vintage film look.',
    aspectRatio: '3:4',
    captionTemplate: 'Vintage vibes are live.',
  },
  artistic: {
    key: 'artistic',
    label: 'Artistic Painting',
    prompt:
      'Using the provided image, interpret this portrait as a fine-art oil painting with visible textured brush strokes, professional gallery lighting, and a moody artistic background. Make it look like a classical painting.',
    aspectRatio: '1:1',
    captionTemplate: 'Fresh off the easel!',
  },
};

const STYLE_ALIASES: Record<string, StyleKey> = {
  '1': 'linkedin',
  linkedin: 'linkedin',
  professional: 'linkedin',
  'linked-in': 'linkedin',
  '2': 'cartoon',
  cartoon: 'cartoon',
  anime: 'cartoon',
  '3': 'cinematic',
  cinematic: 'cinematic',
  movie: 'cinematic',
  '4': 'vintage',
  vintage: 'vintage',
  retro: 'vintage',
  film: 'vintage',
  '5': 'artistic',
  artistic: 'artistic',
  painting: 'artistic',
  painterly: 'artistic',
};

export const normalizeStyleKey = (input: string): StyleKey | null => {
  const normalized = input.trim().toLowerCase();
  return STYLE_ALIASES[normalized] ?? null;
};

export const getStylePreset = (input: string): StylePreset | null => {
  const key =
    (STYLE_PRESETS[input as StyleKey] && (input as StyleKey)) ||
    normalizeStyleKey(input);
  return key ? STYLE_PRESETS[key] : null;
};

export const STYLE_MENU = Object.values(STYLE_PRESETS).map(
  ({ key, label }) => ({ key, label })
);

