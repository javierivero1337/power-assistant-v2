export const DEFAULT_IMAGEN_MODEL = 'gemini-2.5-flash-image';

export type StyleKey =
  | 'artistic'
  | 'cartoon'
  | 'linkedin'
  | 'lego'
  | 'cinematic'
  | 'magazine'
  | '3d'
  | 'beauty'
  | 'professional';

export interface StylePreset {
  key: StyleKey;
  label: string;
  prompt: string;
  aspectRatio?: string;
  model?: string;
  captionTemplate: string;
}

export const STYLE_PRESETS: Record<StyleKey, StylePreset> = {
  artistic: {
    key: 'artistic',
    label: 'Artistic (Oil Painting)',
    prompt:
      'Using the provided image, transform this portrait into a masterful Renaissance-era oil painting. Apply rich, layered brush strokes with visible texture, dramatic chiaroscuro lighting reminiscent of Rembrandt or Caravaggio, warm golden undertones, and a dark moody background. The subject should appear noble and timeless, as if painted by an Old Master in the 15th-16th century. Include subtle craquelure texture for authenticity.',
    aspectRatio: '3:4',
    captionTemplate: '🎨 Una obra maestra del Renacimiento.',
  },
  cartoon: {
    key: 'cartoon',
    label: 'Cartoon / Anime',
    prompt:
      'Using the provided image, transform this person into a vibrant cartoon or anime character with bold clean outlines, expressive enlarged eyes, smooth cel-shaded coloring, and bright saturated colors. Keep the person recognizable but with stylized cartoon features. The style should be fun, energetic, and reminiscent of modern anime or Pixar-style animation.',
    aspectRatio: '1:1',
    captionTemplate: '🎬 ¡Modo caricatura activado!',
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn Professional',
    prompt:
      'Using the provided image, create a polished, professional LinkedIn-style headshot with even soft studio lighting, a clean neutral gradient background (soft gray or blue), and realistic natural color grading. Keep the person\'s identity and features completely intact. Ensure professional appearance with smooth skin retouching, confident expression, and business-appropriate presentation. The lighting should be flattering with soft shadows.',
    aspectRatio: '1:1',
    captionTemplate: '💼 Tu foto profesional está lista.',
  },
  lego: {
    key: 'lego',
    label: 'Lego Version',
    prompt:
      'Using the provided image, transform this person into an authentic LEGO minifigure. The result should look like a real plastic LEGO toy with the characteristic yellow skin, simple curved smile, dot eyes, and blocky body shape. Include realistic plastic texture with slight reflections, the classic LEGO hair piece matching their hairstyle, and appropriate minifigure accessories. The background should be simple and clean to showcase the minifigure.',
    aspectRatio: '1:1',
    captionTemplate: '🧱 ¡Tu versión LEGO ha llegado!',
  },
  cinematic: {
    key: 'cinematic',
    label: 'Cinematic B&W',
    prompt:
      'Using the provided image, create a dramatic studio portrait with cinematic black-and-white color grading. Apply professional skin tone adjustment before converting to monochrome. Use high contrast with deep blacks and bright highlights, dramatic side lighting creating sculptural shadows on the face, shallow depth of field effect, and film grain texture. The mood should be intense and editorial, like a Hollywood publicity still from the golden age of cinema.',
    aspectRatio: '3:4',
    captionTemplate: '🎬 Cinematográfico en blanco y negro.',
  },
  magazine: {
    key: 'magazine',
    label: 'Magazine Cover',
    prompt:
      'Using the provided image, create a retro vintage editorial magazine cover aesthetic. The person should be styled in an elegant black suit with a Pinterest-worthy 90s movie star vibe. Add a small flower bouquet in hand, windswept hair effect, and a romanticized dreamy atmosphere. The background should be minimalist with deep shadows and dramatic contrast. Apply warm golden hour lighting with sunset tones, vintage film grain, and a mysterious artistic atmosphere. The overall feeling should be timeless editorial elegance.',
    aspectRatio: '3:4',
    captionTemplate: '📰 Portada de revista, estilo editorial.',
  },
  '3d': {
    key: '3d',
    label: '3D Caricature',
    prompt:
      'Using the provided image, create a highly stylized 3D caricature render with exaggerated but charming facial features - slightly larger head, expressive eyes, and playful proportions. Render in a smooth, polished Pixar/DreamWorks style with clean subsurface scattering on skin, soft ambient occlusion lighting, and professional studio lighting setup. Place on a bold solid color background (vibrant blue, orange, or purple) to emphasize the character\'s charm and presence. The overall look should be fun, professional, and ready for a profile picture.',
    aspectRatio: '1:1',
    captionTemplate: '🎮 ¡Tu versión 3D está lista!',
  },
  beauty: {
    key: 'beauty',
    label: 'Beauty Assessment',
    prompt:
      'Using the provided image, create an analytical beauty assessment overlay. Annotate the photo with futuristic console-style HUD elements including: scan lines, data readouts, and pointer arrows highlighting facial features. Add loading bars rating different categories (symmetry, jawline, eyes, skin, hair, overall harmony) with percentage scores. Include an overall attractiveness rating prominently displayed. Use a tech/cyberpunk aesthetic with neon green or cyan text on a slightly darkened version of the original photo. Make it look like a sci-fi facial analysis system.',
    aspectRatio: '3:4',
    captionTemplate: '📊 Análisis de belleza completado.',
  },
  professional: {
    key: 'professional',
    label: 'Professional Shoot',
    prompt:
      'Using the provided image, create an ultra-realistic 4K editorial portrait. Capture the subject in a relaxed yet confident pose against a textured wall, bathed in soft golden hour light that casts long, warm, contrasting shadows. The aesthetic should be cinematic, vintage, and editorial with warm color tones, subtle film grain, and timeless elegance. Apply professional skin retouching while maintaining natural texture. The lighting should evoke sunset warmth with a sophisticated, magazine-quality finish.',
    aspectRatio: '3:4',
    captionTemplate: '📸 Sesión profesional completada.',
  },
};

const STYLE_ALIASES: Record<string, StyleKey> = {
  // Artistic
  '1': 'artistic',
  artistic: 'artistic',
  artistico: 'artistic',
  'oil painting': 'artistic',
  pintura: 'artistic',
  renaissance: 'artistic',
  renacimiento: 'artistic',
  
  // Cartoon
  '2': 'cartoon',
  cartoon: 'cartoon',
  caricatura: 'cartoon',
  anime: 'cartoon',
  
  // LinkedIn
  '3': 'linkedin',
  linkedin: 'linkedin',
  professional: 'linkedin',
  profesional: 'linkedin',
  headshot: 'linkedin',
  
  // Lego
  '4': 'lego',
  lego: 'lego',
  
  // Cinematic
  '5': 'cinematic',
  cinematic: 'cinematic',
  cinematico: 'cinematic',
  'black and white': 'cinematic',
  'blanco y negro': 'cinematic',
  bw: 'cinematic',
  
  // Magazine
  '6': 'magazine',
  magazine: 'magazine',
  revista: 'magazine',
  editorial: 'magazine',
  cover: 'magazine',
  portada: 'magazine',
  
  // 3D
  '7': '3d',
  '3d': '3d',
  caricature: '3d',
  pixar: '3d',
  
  // Beauty
  '8': 'beauty',
  beauty: 'beauty',
  belleza: 'beauty',
  assessment: 'beauty',
  rating: 'beauty',
  analisis: 'beauty',
  
  // Professional
  '9': 'professional',
  'professional shoot': 'professional',
  sesion: 'professional',
  'golden hour': 'professional',
  'hora dorada': 'professional',
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
