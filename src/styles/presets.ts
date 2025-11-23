import { EditMode, PersonGeneration } from '@google/genai';

export const DEFAULT_IMAGEN_MODEL = 'imagen-3.0-capability-001';

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
  negativePrompt?: string;
  aspectRatio?: string;
  model?: string;
  personGeneration?: PersonGeneration;
  editMode?: EditMode;
  captionTemplate: string;
}

export const STYLE_PRESETS: Record<StyleKey, StylePreset> = {
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn Professional Headshot',
    prompt:
      'Enhance this portrait into a polished, professional LinkedIn-style headshot with even studio lighting, a soft neutral background, and realistic color grading. Keep the identity and clothing intact.',
    negativePrompt:
      'No distortions, no exaggerated retouching, no surreal colors, no background clutter, keep proportions natural.',
    aspectRatio: '3:4',
    personGeneration: PersonGeneration.ALLOW_ADULT,
    editMode: EditMode.EDIT_MODE_STYLE,
    captionTemplate: "Here's your LinkedIn-ready portrait.",
  },
  cartoon: {
    key: 'cartoon',
    label: 'Cartoon / Anime',
    prompt:
      'Transform this portrait into a vibrant cartoon illustration with bold outlines, expressive eyes, and bright colors while keeping the person recognisable.',
    negativePrompt: 'Avoid horror elements, avoid deformed anatomy.',
    aspectRatio: '1:1',
    personGeneration: PersonGeneration.ALLOW_ALL,
    editMode: EditMode.EDIT_MODE_STYLE,
    captionTemplate: 'Cartoon mode activated!',
  },
  cinematic: {
    key: 'cinematic',
    label: 'Cinematic Portrait',
    prompt:
      'Restyle this portrait as a cinematic movie poster with dramatic lighting, shallow depth of field, rich contrast, and tasteful color grading.',
    negativePrompt: 'No text overlays, no movie titles, avoid border crops.',
    aspectRatio: '3:4',
    personGeneration: PersonGeneration.ALLOW_ADULT,
    editMode: EditMode.EDIT_MODE_STYLE,
    captionTemplate: 'Cinematic flair, coming right up.',
  },
  vintage: {
    key: 'vintage',
    label: 'Vintage Film',
    prompt:
      'Render this portrait with warm 35mm film tones, gentle grain, and a subtle retro vignette inspired by 1970s photography.',
    negativePrompt: 'No heavy scratches, no washed-out faces.',
    aspectRatio: '3:4',
    personGeneration: PersonGeneration.ALLOW_ADULT,
    editMode: EditMode.EDIT_MODE_STYLE,
    captionTemplate: 'Vintage vibes are live.',
  },
  artistic: {
    key: 'artistic',
    label: 'Artistic Painting',
    prompt:
      'Interpret this portrait as a fine-art oil painting with textured brush strokes, gallery lighting, and a moody background.',
    negativePrompt: 'Avoid surreal melting faces, avoid glitch textures.',
    aspectRatio: '1:1',
    personGeneration: PersonGeneration.ALLOW_ADULT,
    editMode: EditMode.EDIT_MODE_STYLE,
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

