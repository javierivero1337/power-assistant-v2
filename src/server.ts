import 'dotenv/config';

import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { fetch } from 'undici';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import Stripe from 'stripe';

import {
  DEFAULT_IMAGEN_MODEL,
  getStylePreset,
  STYLE_MENU,
} from './styles/presets.js';
import { getUserCredits, deductCredit, addCredits, checkKVConnection } from './db/credits.js';

const PORT = Number(process.env.PORT ?? 4000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
const STRIPE_PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required');
}

if (!WEBHOOK_SECRET) {
  throw new Error('KAPSO_WEBHOOK_SECRET is required');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
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
  userId: z.string().min(1, 'userId is required'),
});

// Normalize phone number to a consistent format
function normalizePhoneNumber(phone: string): string {
  // Remove any spaces, dashes, parentheses
  let normalized = phone.replace(/[\s\-\(\)]/g, '');
  
  // Add + prefix if missing (assumes international format)
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  
  // Handle Mexico phone numbers: +521XXXXXXXXXX → +52XXXXXXXXXX
  // WhatsApp uses +521 for mobile, but we normalize to +52
  if (normalized.startsWith('+521') && normalized.length === 14) {
    normalized = '+52' + normalized.slice(4);
  }
  
  return normalized;
}

const app = express();
app.set('trust proxy', true);

// Stripe webhook needs raw body for signature verification
app.use(
  '/stripe-webhook',
  express.raw({ type: 'application/json' })
);

// All other routes use JSON parser
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

app.get('/health', async (_req, res) => {
  purgeExpired();
  
  const kvHealthy = await checkKVConnection();
  
  res.json({
    status: kvHealthy ? 'ok' : 'degraded',
    cachedMedia: mediaStore.size,
    database: kvHealthy ? 'connected' : 'disconnected',
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

// Admin endpoint: Check user credits
app.get('/admin/credits/:userId', requireWebhookSecret, async (req, res) => {
  try {
    const { userId } = req.params;
    const credits = await getUserCredits(userId);
    res.json({ userId, credits });
  } catch (error) {
    console.error('[admin:credits:get]', error);
    res.status(500).json({ error: 'Failed to retrieve credits' });
  }
});

// Admin endpoint: Manually add credits
app.post('/admin/credits/add', requireWebhookSecret, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    
    const newBalance = await addCredits(userId, amount);
    res.json({ userId, newBalance });
  } catch (error) {
    console.error('[admin:credits:add]', error);
    res.status(500).json({ error: 'Failed to add credits' });
  }
});

app.post(
  '/generate-styled-image',
  requireWebhookSecret,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = requestSchema.parse(req.body);
      const userId = normalizePhoneNumber(payload.userId);

      // Check user's credit balance
      const currentCredits = await getUserCredits(userId);
      
      if (currentCredits < 1) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: 'You need credits to generate images. Purchase 50 credits for $5!',
          creditsRemaining: 0,
          paymentLink: STRIPE_PAYMENT_LINK || 'https://stripe.com',
        });
      }

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
        aspectRatio: payload.aspectRatio ?? preset.aspectRatio,
        model: preset.model,
        baseImage: buffer,
        baseMimeType: mimeType,
      });

      // Deduct credit after successful generation
      const deductResult = await deductCredit(userId);
      
      if (!deductResult.success) {
        // This shouldn't happen since we checked above, but handle it anyway
        return res.status(402).json({
          error: 'Credit deduction failed',
          message: 'Unable to deduct credit. Please try again.',
          creditsRemaining: deductResult.remaining,
        });
      }

      const resourceId = storeImage(stylizedImage.buffer, stylizedImage.mimeType);
      const baseUrl = PUBLIC_BASE_URL ?? inferBaseUrl(req);
      const stylizedImageUrl = `${baseUrl}/media/${resourceId}`;

      res.json({
        stylizedImageUrl,
        caption: preset.captionTemplate,
        style: preset.label,
        creditsRemaining: deductResult.remaining,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post('/stripe-webhook', async (req: Request, res: Response) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] Stripe not configured');
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    console.log('[stripe-webhook] Checkout completed:', {
      sessionId: session.id,
      customer: session.customer_details?.email,
    });

    try {
      // Extract phone number from custom fields or metadata
      let userId: string | null = null;

      // Try custom_fields first (if configured in Payment Link)
      if (session.custom_fields && session.custom_fields.length > 0) {
        const phoneField = session.custom_fields.find(
          (field) => field.key === 'phone' || field.key === 'whatsapp_number'
        );
        if (phoneField && phoneField.text) {
          userId = phoneField.text.value;
        }
      }

      // Fallback to metadata
      if (!userId && session.metadata?.userId) {
        userId = session.metadata.userId;
      }

      // Fallback to customer phone
      if (!userId && session.customer_details?.phone) {
        userId = session.customer_details.phone;
      }

      if (!userId) {
        console.error('[stripe-webhook] No userId found in session');
        return res.status(400).json({ error: 'No userId in session' });
      }

      // Normalize the phone number for consistency
      userId = normalizePhoneNumber(userId);

      // Add 20 credits to the user
      const CREDITS_PER_PURCHASE = 20;
      const newBalance = await addCredits(userId, CREDITS_PER_PURCHASE);

      console.log('[stripe-webhook] Credits added:', {
        userId,
        creditsAdded: CREDITS_PER_PURCHASE,
        newBalance,
        sessionId: session.id,
      });

      res.json({ received: true, userId, newBalance });
    } catch (error) {
      console.error('[stripe-webhook] Error adding credits:', error);
      return res.status(500).json({ error: 'Failed to add credits' });
    }
  } else {
    // Unexpected event type
    console.log('[stripe-webhook] Unhandled event type:', event.type);
    res.json({ received: true });
  }
});

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
  aspectRatio,
  model,
  baseImage,
  baseMimeType,
}: {
  presetPrompt: string;
  aspectRatio?: string;
  model?: string;
  baseImage: Buffer;
  baseMimeType: string;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  // Use Gemini image generation API (Nano Banana)
  const geminiModel = model ?? DEFAULT_IMAGEN_MODEL;
  
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: [
      {
        parts: [
          { text: presetPrompt },
          {
            inlineData: {
              mimeType: baseMimeType,
              data: baseImage.toString('base64'),
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio ?? '1:1',
      },
    },
  });

  // Extract image from response
  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error('Gemini response did not include content parts');
  }

  const imagePart = candidate.content.parts.find((part: any) => part.inlineData);
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini response did not include image data');
  }

  return {
    buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimeType: imagePart.inlineData.mimeType ?? 'image/png',
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

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`⚡️ Stylizer webhook listening on :${PORT}`);
  });
}

// Export for Vercel serverless
export default app;

