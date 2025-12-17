import 'dotenv/config';

import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { getUserCredits, deductCredit, addCredits, setCredits, checkKVConnection, getAllUsersWithCredits, deleteUser } from './db/credits.js';
import { logTransaction, CreditTransaction, getTransactions, getTransactionStats, getUserTransactionHistory } from './db/transactions.js';

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
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
  // Allows Kapso to pass the human-readable inbound message content that contains a Kapso-hosted URL.
  // Example: "Image attached (...) URL: https://app.kapso.ai/rails/active_storage/blobs/redirect/..."
  messageContent: z.string().optional(),
  style: z.string(),
  aspectRatio: z.string().optional(),
  imageSize: z.string().optional(),
  userId: z.string().min(1, 'userId is required'),
}).refine(
  (data) => data.imageUrl || data.imageBase64 || data.messageContent,
  { message: 'Either imageUrl, imageBase64, or messageContent is required' }
);

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

function extractFirstUrl(input: string): string | null {
  if (!input) return null;
  const match = input.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  // Trim common trailing punctuation/brackets that often appear in logs or formatted strings.
  const raw = match[0];
  const cleaned = raw.replace(/[)\],.]+$/g, '');
  return cleaned;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Serve dashboard UI
app.get('/admin/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
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

// Admin endpoint: Set credits to a specific value
app.post('/admin/credits/set', requireWebhookSecret, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    
    const newBalance = await setCredits(userId, amount);
    res.json({ userId, newBalance });
  } catch (error) {
    console.error('[admin:credits:set]', error);
    res.status(500).json({ error: 'Failed to set credits' });
  }
});

// Admin endpoint: Delete a user entirely
app.delete('/admin/users/:userId', requireWebhookSecret, async (req, res) => {
  try {
    const { userId } = req.params;
    const deleted = await deleteUser(userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, userId });
  } catch (error) {
    console.error('[admin:users:delete]', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin endpoint: List all transactions with optional filtering
app.get('/admin/transactions', requireWebhookSecret, async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { transactions, total } = await getTransactions({ userId, limit, offset });
    const stats = await getTransactionStats();
    
    res.json({
      transactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      },
      stats,
    });
  } catch (error) {
    console.error('[admin:transactions]', error);
    res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
});

// Admin endpoint: Get user credits with transaction history
app.get('/admin/users/:userId/credits', requireWebhookSecret, async (req, res) => {
  try {
    const { userId } = req.params;
    const normalizedUserId = normalizePhoneNumber(userId);
    
    const credits = await getUserCredits(normalizedUserId);
    const { transactions, totalCreditsFromPurchases } = await getUserTransactionHistory(normalizedUserId);
    
    res.json({
      userId: normalizedUserId,
      currentBalance: credits,
      totalCreditsFromPurchases,
      creditsUsed: totalCreditsFromPurchases - credits,
      transactions,
    });
  } catch (error) {
    console.error('[admin:users:credits]', error);
    res.status(500).json({ error: 'Failed to retrieve user credits' });
  }
});

// Admin endpoint: List all users with credit balances
app.get('/admin/users', requireWebhookSecret, async (_req, res) => {
  try {
    const users = await getAllUsersWithCredits();
    const totalCredits = users.reduce((sum, u) => sum + u.credits, 0);
    
    res.json({
      users,
      summary: {
        totalUsers: users.length,
        totalCredits,
        usersWithCredits: users.filter(u => u.credits > 0).length,
      },
    });
  } catch (error) {
    console.error('[admin:users]', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// New endpoint: Download image from Kapso URL and return base64
app.post(
  '/download-image-to-base64',
  requireWebhookSecret,
  async (req: Request, res: Response) => {
    try {
      const { imageUrl, messageContent } = req.body ?? {};
      const resolvedUrl =
        (typeof imageUrl === 'string' && imageUrl.trim()) ||
        (typeof messageContent === 'string' ? extractFirstUrl(messageContent) : null);
      
      if (!resolvedUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
      }
      
      console.log('[download-image-to-base64] Downloading:', resolvedUrl);
      
      const downloaded = await downloadImage(resolvedUrl);
      const base64Data = downloaded.buffer.toString('base64');
      
      console.log('[download-image-to-base64] Success:', {
        mimeType: downloaded.mimeType,
        sizeKB: Math.round(downloaded.buffer.length / 1024),
      });
      
      return res.json({
        imageBase64: base64Data,
        imageMimeType: downloaded.mimeType,
        sizeBytes: downloaded.buffer.length,
      });
    } catch (error: any) {
      console.error('[download-image-to-base64] Error:', error);
      return res.status(500).json({
        error: 'Failed to download image',
        message: error.message,
      });
    }
  }
);

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

      // Support both URL download and direct base64 input
      let buffer: Buffer;
      let mimeType: string;
      
      console.log('[generate-styled-image] Payload received:', {
        hasImageUrl: !!payload.imageUrl,
        hasImageBase64: !!payload.imageBase64,
        imageUrlPreview: payload.imageUrl?.substring(0, 100),
        style: payload.style,
        userId: payload.userId,
      });
      
      if (payload.imageBase64) {
        // Direct base64 input (preferred - avoids auth issues)
        console.log('[generate-styled-image] Using base64 input');
        buffer = Buffer.from(payload.imageBase64, 'base64');
        mimeType = payload.imageMimeType ?? 'image/jpeg';
      } else if (payload.imageUrl || payload.messageContent) {
        // URL download (may fail if URL requires auth)
        const resolvedUrl =
          payload.imageUrl ??
          (payload.messageContent ? extractFirstUrl(payload.messageContent) : null);

        if (!resolvedUrl) {
          return res.status(400).json({
            error: 'Image URL not found',
            message: 'No se encontró una URL de imagen. Por favor envía la foto otra vez.',
          });
        }

        console.log('[generate-styled-image] Downloading from URL:', resolvedUrl);
        try {
          const downloaded = await downloadImage(resolvedUrl);
          buffer = downloaded.buffer;
          mimeType = downloaded.mimeType;
        } catch (downloadError: any) {
          console.error('[generate-styled-image] Image download failed:', downloadError);
          return res.status(400).json({
            error: 'Image download failed',
            message: downloadError.message || 'Unable to download the image. Please send a new image.',
            details: 'The image URL may have expired or is no longer accessible.',
          });
        }
      } else {
        return res
          .status(400)
          .json({ error: 'Either imageUrl, imageBase64, or messageContent is required' });
      }
      
      // Log image details before processing
      console.log('[generate-styled-image] Image details:', {
        size: `${Math.round(buffer.length / 1024)}KB`,
        mimeType,
        userId,
        style: payload.style,
      });
      
      let stylizedImage;
      try {
        stylizedImage = await stylizeImage({
          presetPrompt: preset.prompt,
          aspectRatio: payload.aspectRatio ?? preset.aspectRatio,
          model: preset.model,
          baseImage: buffer,
          baseMimeType: mimeType as string,
        });
      } catch (stylizeError: any) {
        console.error('[generate-styled-image] Stylization failed:', stylizeError);
        
        // Return user-friendly error without deducting credits
        return res.status(500).json({
          error: 'Image processing failed',
          message: stylizeError.message || 'Unable to process this image. Please try with a different photo.',
          details: 'The image may be corrupted, too large, or in an unsupported format. Supported formats: JPEG, PNG, WebP (max 20MB).',
        });
      }

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

      // Log the transaction for the dashboard
      const transaction: CreditTransaction = {
        id: session.id,
        userId,
        creditsAdded: CREDITS_PER_PURCHASE,
        amountPaid: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        createdAt: Date.now(),
        email: session.customer_details?.email ?? undefined,
      };
      await logTransaction(transaction);

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

async function validateAndProcessImage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Validate image size (max 20MB for Gemini API)
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Image too large: ${Math.round(buffer.length / 1024 / 1024)}MB. Maximum size is 20MB.`);
  }

  // Validate MIME type
  const supportedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();
  
  if (!supportedMimeTypes.includes(normalizedMimeType)) {
    console.warn(`[validateImage] Unsupported MIME type: ${mimeType}, normalizing to image/jpeg`);
    // Default to jpeg if mime type is weird
    return { buffer, mimeType: 'image/jpeg' };
  }

  // Validate that buffer is not empty
  if (buffer.length === 0) {
    throw new Error('Image buffer is empty');
  }

  // Basic validation that it looks like an image (check magic bytes)
  const magicBytes = buffer.slice(0, 4).toString('hex');
  const isValidImage = 
    magicBytes.startsWith('ffd8ff') || // JPEG
    magicBytes.startsWith('89504e47') || // PNG
    magicBytes.startsWith('52494646'); // WEBP

  if (!isValidImage) {
    console.warn(`[validateImage] Image may be corrupted. Magic bytes: ${magicBytes}`);
  }

  console.log('[validateImage] Image validated:', {
    size: `${Math.round(buffer.length / 1024)}KB`,
    mimeType: normalizedMimeType,
    magicBytes: magicBytes.substring(0, 8),
  });

  return { buffer, mimeType: normalizedMimeType };
}

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
  // Validate and process the image first
  const { buffer: validatedBuffer, mimeType: validatedMimeType } = await validateAndProcessImage(baseImage, baseMimeType);
  
  // Use Gemini image generation API (Nano Banana)
  const geminiModel = model ?? DEFAULT_IMAGEN_MODEL;
  
  console.log('[stylizeImage] Sending request to Gemini:', {
    model: geminiModel,
    imageSize: `${Math.round(validatedBuffer.length / 1024)}KB`,
    mimeType: validatedMimeType,
    aspectRatio: aspectRatio ?? '1:1',
    promptLength: presetPrompt.length,
  });
  
  try {
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: [
        {
          parts: [
            { text: presetPrompt },
            {
              inlineData: {
                mimeType: validatedMimeType,
                data: validatedBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio ?? '1:1',
          imageSize: '1K', // 1K resolution (1024px) - same token cost as 2K (1210 tokens)
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

    console.log('[stylizeImage] Successfully generated image');

    return {
      buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
      mimeType: imagePart.inlineData.mimeType ?? 'image/png',
    };
  } catch (error: any) {
    console.error('[stylizeImage] Gemini API error:', {
      error: error.message,
      status: error.status,
      code: error.code,
      imageSize: `${Math.round(validatedBuffer.length / 1024)}KB`,
      mimeType: validatedMimeType,
    });
    
    // Provide user-friendly error messages
    if (error.status === 400) {
      throw new Error('Unable to process this image. Please try with a different photo or ensure the image is clear and not corrupted.');
    }
    
    throw error;
  }
}

async function downloadImage(url: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  console.log('[downloadImage] Attempting to download:', url);
  
  // Check if this is a Kapso URL that needs special handling
  const isKapsoUrl = url.includes('app.kapso.ai') || url.includes('kapso.ai');
  
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; Revelio/1.0)',
    'Accept': 'image/*,*/*',
  };
  
  // Add Kapso webhook secret for authenticated downloads if it's a Kapso URL
  if (isKapsoUrl && WEBHOOK_SECRET) {
    headers['x-kapso-webhook-secret'] = WEBHOOK_SECRET;
  }
  
  const response = await fetch(url, {
    headers,
    redirect: 'follow',
  });
  
  if (!response.ok) {
    console.error('[downloadImage] Failed:', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      isKapsoUrl,
      headers: Object.fromEntries(response.headers.entries()),
    });
    
    // Provide more helpful error messages
    if (response.status === 404) {
      throw new Error('Image not found or expired. Please send a new image.');
    } else if (response.status === 401 || response.status === 403) {
      throw new Error('Unable to access image. Please send the image again.');
    }
    
    throw new Error(`Failed to download image: ${response.status}`);
  }
  
  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  
  console.log('[downloadImage] Success:', {
    finalUrl: response.url,
    mimeType,
    size: arrayBuffer.byteLength,
    isKapsoUrl,
  });
  
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

