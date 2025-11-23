import 'dotenv/config';

import express, { NextFunction, Request, Response } from 'express';
import {
  EditMode,
  GoogleGenAI,
  PersonGeneration,
  RawReferenceImage,
} from '@google/genai';
import { fetch } from 'undici';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';

import {
  DEFAULT_IMAGEN_MODEL,
  getStylePreset,
  STYLE_MENU,
} from './styles/presets.js';

const PORT = Number(process.env.PORT ?? 4000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required');
}

if (!WEBHOOK_SECRET) {
  throw new Error('KAPSO_WEBHOOK_SECRET is required');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const makeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 21);

type StoredImage = {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
};

const RESULT_TTL_MS = 30 * 60 * 1000;
const mediaStore = new Map<string, StoredImage>();

const requestSchema = z.object({
  imageUrl: z.string().url('imageUrl must be a valid URL'),
  style: z.string(),
  aspectRatio: z.string().optional(),
  imageSize: z.string().optional(),
});

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '15mb' }));

const purgeExpired = () => {
  const now = Date.now();
  for (const [key, value] of mediaStore.entries()) {
    if (value.expiresAt < now) {
      mediaStore.delete(key);
    }
  }
};

const requireWebhookSecret = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const secret = req.header('x-kapso-webhook-secret');
  if (!secret || secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
};

app.get('/health', (_req, res) => {
  purgeExpired();
  res.json({
    status: 'ok',
    cachedMedia: mediaStore.size,
  });
});

app.get('/media/:id', (req, res) => {
  purgeExpired();
  const record = mediaStore.get(req.params.id);
  if (!record) {
    return res.status(404).send('Not found');
  }
  res.setHeader('Content-Type', record.mimeType);
  return res.send(record.buffer);
});

app.post(
  '/generate-styled-image',
  requireWebhookSecret,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = requestSchema.parse(req.body);
      const preset = getStylePreset(payload.style);
      if (!preset) {
        return res.status(400).json({
          error: `Unknown style "${payload.style}".`,
          supportedStyles: STYLE_MENU.map((style) => style.key),
        });
      }

      const { buffer, mimeType } = await downloadImage(payload.imageUrl);
      const stylizedImage = await stylizeImage({
        presetPrompt: preset.prompt,
        negativePrompt: preset.negativePrompt,
        aspectRatio: payload.aspectRatio ?? preset.aspectRatio,
        personGeneration: preset.personGeneration,
        editMode: preset.editMode,
        model: preset.model,
        baseImage: buffer,
        baseMimeType: mimeType,
      });

      const resourceId = storeImage(stylizedImage.buffer, stylizedImage.mimeType);
      const baseUrl = PUBLIC_BASE_URL ?? inferBaseUrl(req);
      const stylizedImageUrl = `${baseUrl}/media/${resourceId}`;

      res.json({
        stylizedImageUrl,
        caption: preset.captionTemplate,
        style: preset.label,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[stylizer:error]', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.flatten() });
    }
    return res.status(500).json({ error: 'Failed to stylize image.' });
  }
);

async function stylizeImage({
  presetPrompt,
  negativePrompt,
  aspectRatio,
  personGeneration,
  editMode,
  model,
  baseImage,
  baseMimeType,
}: {
  presetPrompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  personGeneration?: PersonGeneration;
  editMode?: EditMode;
  model?: string;
  baseImage: Buffer;
  baseMimeType: string;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const reference = new RawReferenceImage();
  reference.referenceImage = {
    imageBytes: baseImage.toString('base64'),
    mimeType: baseMimeType,
  };

  const response = await ai.models.editImage({
    model: model ?? DEFAULT_IMAGEN_MODEL,
    prompt: presetPrompt,
    referenceImages: [reference],
    config: {
      numberOfImages: 1,
      aspectRatio: aspectRatio ?? '1:1',
      negativePrompt,
      personGeneration,
      editMode,
      includeRaiReason: true,
    },
  });

  const generated = response.generatedImages?.[0]?.image ??
    (() => {
      throw new Error('Imagen response did not include image bytes');
    })();

  if (!generated.imageBytes) {
    throw new Error('Imagen response missing image bytes payload');
  }

  return {
    buffer: Buffer.from(generated.imageBytes, 'base64'),
    mimeType: generated.mimeType ?? 'image/png',
  };
}

async function downloadImage(url: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
  };
}

function storeImage(buffer: Buffer, mimeType: string): string {
  purgeExpired();
  const id = makeId();
  mediaStore.set(id, {
    buffer,
    mimeType,
    expiresAt: Date.now() + RESULT_TTL_MS,
  });
  return id;
}

function inferBaseUrl(req: Request): string {
  const protocol =
    req.headers['x-forwarded-proto']?.toString() ?? req.protocol ?? 'https';
  const host = req.get('host');
  if (!host) {
    throw new Error('Unable to infer host for media URL');
  }
  return `${protocol}://${host}`;
}

app.listen(PORT, () => {
  console.log(`⚡️ Stylizer webhook listening on :${PORT}`);
});

