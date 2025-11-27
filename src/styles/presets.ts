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
      'Using the provided image, transform this portrait into a comic book art style. The image should feature thick, dark outlines, vibrant yet flat colors, and clear shading that defines shapes rather than realistic blending. Emphasize a clean, graphic novel aesthetic with a hand-drawn feel, similar to modern webcomics or animated series character designs. Focus on strong character expressions and a dynamic composition. Bright, even lighting. Friendly pose',
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
      'Using the provided image, transform this person into a LEGO-inspired character. The image should capture the distinctive blocky, modular aesthetic of LEGO, with elements that suggest plastic construction and interlocking bricks. Incorporate smooth, stylized surfaces and a sense of simplified, toy-like realism. Maintain the subjects key features in a recognizable yet distinctly LEGO-fied manner. The overall feel should be playful and vibrant, as if the character has been built from LEGO pieces, with bright, even lighting.',
    aspectRatio: '1:1',
    captionTemplate: '🧱 ¡Tu versión LEGO ha llegado!',
  },
  cinematic: {
    key: 'cinematic',
    label: 'Cinematic B&W',
    prompt:
      'Super realistic studio portrait. Use the person in the uploaded image. Do not change or alter the face, bone structure, gender, age, skin tone, hairstyle, or identity. Keep the same hair length and style exactly as in the uploaded photo. Pose: Head slightly tilted downward, eyes looking directly into the camera, creating a strong, mysterious expression.Clothing: A black high-neck sweater. One hand casually touching or lightly adjusting the collar (not covering the mouth). The face remains mostly visible, only a subtle gesture with the hand near the collar.Lighting & Background: Warm, soft studio lighting with a gentle shadow on one side of the face. Dark red background, plain, uniform, no patterns. Slight background blur, delicate film grain, and soft vignette on the edges.Framing: Chest-up portrait, subject centered in the frame.Rendering Style: Photorealistic, high resolution, natural realistic skin texture, no beautification, preserve real facial details and identity.',
          aspectRatio: '3:4',
    captionTemplate: '🎬 Cinematográfico en blanco y negro.',
  },
  magazine: {
    key: 'magazine',
    label: 'Magazine Cover',
    prompt:
      'Using the provided image, transform this picture into a A cinematic close-up editorial portrait wearing sleek black blazer, and black turtleneck, very low angle chin tilted upward, direct gaze with subtle smirk, seamless vivid orange studio background, 85mm lens, f/4, ISO 100, shutter 1/200s, cinematic dual-tone lighting with warm orange glow and cool blue rim highlights',
    aspectRatio: '3:4',
    captionTemplate: '📰 Portada de revista, estilo editorial.',
  },
  '3d': {
    key: '3d',
    label: '3D Caricature',
    prompt:
      'Using the provided image, transform this portrait into a 3D animated character portrait. The style should be reminiscent of modern Pixar or Dreamworks animation – with large, expressive eyes, smooth skin texture, slightly exaggerated but friendly facial features, and a vibrant, clean aesthetic. The lighting should be soft and inviting, similar to professional animation studio renders. Focus on a warm and approachable tone. High detail, vivid colors, cinematic animation still. Full body shot, looking directly at the viewer.',
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
