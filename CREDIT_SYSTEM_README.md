# Credit System Implementation

This document provides an overview of the credit-based payment system implemented for the WhatsApp Image Styler bot.

## Overview

The bot now uses a **credit-based payment system** where users must purchase credits to generate styled images. Each image generation costs 1 credit.

### Pricing
- **Package**: 10 credits for $100.00 MXN
- **Cost per generation**: 1 credit ($10.00 MXN effective)
- **Free trial**: 1 free credit for new users (granted atomically via Redis SETNX on first `/generate-styled-image` call)
- **Credit expiration**: None (credits never expire)

## Architecture

```
User sends photo → Kapso deterministic flow → POST /generate-styled-image →
  ├─ New user? tryGrantFreeTrial (SETNX → 1 credit)
  ├─ Sufficient credits → Gemini → Deduct 1 credit → Return /media/:id URL
  └─ Insufficient credits → Return HTTP 402 with paymentLink

User completes payment → Stripe webhook → +10 credits (idempotent via stripe:processed:{sessionId})
```

## Components

### 1. Database Layer (`src/db/credits.ts`)

Manages all credit operations using Redis (`REDIS_URL`, `node-redis` client):

- **`getUserCredits(userId)`**: Get current credit balance
- **`tryGrantFreeTrial(userId)`**: Atomically grant 1 credit to brand-new users (SETNX)
- **`deductCredit(userId)`**: Atomically deduct 1 credit
- **`addCredits(userId, amount)`**: Add credits after payment
- **`setCredits(userId, amount)`**: Admin function to set balance
- **`claimStripeSession(sessionId)`**: Idempotency guard for Stripe webhooks
- **`checkKVConnection()`**: Health check for Redis connectivity

**Key Features**:
- Atomic operations prevent race conditions
- Redis keys: `credits:{phoneNumber}` (E.164, normalized)
- Transaction sorted sets: `credits:txns`, `credits:txns:user:{userId}`
- Stripe dedup keys: `stripe:processed:{sessionId}`

### 2. Main Server (`src/server.ts`)

#### Updated Endpoints

**`POST /generate-styled-image`** (Modified)
- Now requires `userId` parameter (WhatsApp phone number)
- Checks credit balance before processing
- Returns 402 if insufficient credits
- Deducts 1 credit after successful generation
- Returns `creditsRemaining` in response

**`POST /stripe-webhook`** (New)
- Receives Stripe checkout completion events
- Verifies webhook signature for security
- Extracts user's phone number from custom fields (`phone` / `whatsapp_number`), metadata, or `customer_details.phone`
- Idempotent: skips duplicate deliveries via `stripe:processed:{sessionId}` in Redis
- Adds 10 credits to user's account
- Logs purchase transaction for the dashboard

**`GET /admin/credits/:userId`** (New)
- Check any user's credit balance
- Protected by webhook secret

**`POST /admin/credits/add`** (New)
- Manually add credits to a user
- Useful for testing and customer support
- Protected by webhook secret

**`GET /health`** (Updated)
- Now includes Redis connection status
- Returns "ok" or "degraded" based on Redis connectivity

### 3. Payment Integration

#### Stripe Configuration
1. **Product**: "StyleBot Credits - 10 Pack" at $100 MXN
2. **Payment Link**: Collects WhatsApp phone number
3. **Webhook**: Listens for `checkout.session.completed` events
4. **Security**: Signature verification on all webhooks

See `docs/setup/STRIPE_SETUP.md` for detailed setup instructions.

### 4. Kapso Integration

The WhatsApp bot uses a **deterministic flow** (not an Agent node). See `docs/workflows/KAPSO_WORKFLOW.md` for the canonical workflow setup.

Key webhook body for `POST /generate-styled-image`:
```json
{
  "style": "{{vars.selected_style_key}}",
  "userId": "{{context.contact.wa_id}}",
  "messageContent": "{{vars.pending_image_message}}"
}
```

The `extract-response` function detects HTTP 402 responses (`paymentLink`, `payment_required`) and routes to a payment message or image delivery.

## API Reference

### Generate Styled Image

**Request**:
```json
POST /generate-styled-image
Headers:
  Content-Type: application/json
  X-Kapso-Webhook-Secret: <secret>

Body:
{
  "messageContent": "Image attached ... URL: https://...",
  "style": "linkedin",
  "userId": "+15551234567"
}
```

Also accepted (any one required): `imageUrl`, `imageBase64` (+ optional `imageMimeType`).

**Response (Success)**:
```json
{
  "stylizedImageUrl": "https://app.vercel.app/media/abc123",
  "caption": "Here's your LinkedIn-ready portrait.",
  "style": "LinkedIn Professional Headshot",
  "creditsRemaining": 42
}
```

**Response (Insufficient Credits)**:
```json
HTTP 402 Payment Required
{
  "error": "Insufficient credits",
  "message": "No tienes créditos suficientes. Compra 10 créditos por $100 MXN para generar tu imagen.",
  "creditsRemaining": 0,
  "paymentLink": "https://buy.stripe.com/xxxxx"
}
```

### Admin: Check Credits

```bash
GET /admin/credits/:userId
Headers:
  X-Kapso-Webhook-Secret: <secret>

Response:
{
  "userId": "+15551234567",
  "credits": 42
}
```

### Admin: Add Credits

```bash
POST /admin/credits/add
Headers:
  Content-Type: application/json
  X-Kapso-Webhook-Secret: <secret>

Body:
{
  "userId": "+15551234567",
  "amount": 50
}

Response:
{
  "userId": "+15551234567",
  "newBalance": 92
}
```

## Environment Variables

Add these to your Vercel project:

```bash
# Existing variables
GEMINI_API_KEY=<your-gemini-key>
KAPSO_WEBHOOK_SECRET=<your-kapso-secret>
REDIS_URL=<redis-connection-url>
PORT=4000
PUBLIC_BASE_URL=https://your-app.vercel.app
NODE_ENV=production

# Credit system / Stripe
STRIPE_SECRET_KEY=sk_test_<your-stripe-key>
STRIPE_WEBHOOK_SECRET=whsec_<your-webhook-secret>
STRIPE_PAYMENT_LINK=https://buy.stripe.com/<your-link>
```

## Setup Instructions

### 1. Set Up Redis

1. Provision a Redis instance (e.g., Upstash via Vercel Marketplace)
2. Add `REDIS_URL` to Vercel environment variables
3. Verify with `/health` — `database` should be `"connected"`

### 2. Configure Stripe

Follow the detailed guide in `docs/setup/STRIPE_SETUP.md`:

1. Create product and payment link
2. Configure custom field for phone number
3. Set up webhook endpoint
4. Copy API keys to Vercel

### 3. Update Kapso Workflow

Follow `docs/workflows/KAPSO_WORKFLOW.md` to configure the deterministic flow (style menu 1–10, webhooks, 402 payment routing).

### 4. Deploy

```bash
git add .
git commit -m "Add credit system"
git push
```

Vercel will automatically deploy.

## Testing

See `docs/testing/CREDIT_SYSTEM_TESTS.md` for comprehensive test scenarios.

### Quick Test

1. **Add credits manually**:
   ```bash
   curl -X POST "https://your-app.vercel.app/admin/credits/add" \
     -H "Content-Type: application/json" \
     -H "X-Kapso-Webhook-Secret: YOUR_SECRET" \
     -d '{"userId": "+15551234567", "amount": 5}'
   ```

2. **Check balance**:
   ```bash
   curl "https://your-app.vercel.app/admin/credits/+15551234567" \
     -H "X-Kapso-Webhook-Secret: YOUR_SECRET"
   ```

3. **Test payment flow**:
   - Open your Stripe payment link
   - Use test card: `4242 4242 4242 4242`
   - Enter phone number: `+15551234567`
   - Complete payment
   - Check credits were added

## User Experience Flow

### First-Time User
1. User sends photo to WhatsApp bot → bot shows style menu (1–10)
2. User picks a style → backend grants **1 free trial credit** (SETNX) and generates the image
3. Bot sends styled image with remaining credits (0 after first use)
4. User sends another photo → backend returns HTTP 402 with payment link
5. User completes payment → 10 credits added via Stripe webhook
6. User sends photo again → generation succeeds; bot shows 9 credits remaining

### Returning User with Credits
1. User sends photo
2. Bot generates and sends styled image
3. Bot says: "You have 42 credits remaining."

### User Running Low on Credits
1. User generates image (3 credits remaining)
2. Bot says: "Running low! Get 10 more credits for $100 MXN: [link]"

## Security Considerations

1. **Webhook Authentication**: All endpoints protected by `X-Kapso-Webhook-Secret`
2. **Stripe Signature Verification**: Webhooks verified using `stripe-signature` header
3. **Atomic Operations**: Redis INCR/DECR prevent race conditions
4. **No Negative Balances**: Deduction checks balance first
5. **Environment Variables**: Secrets never committed to git

## Admin Dashboard

A built-in dashboard is available to view all credit transactions by phone number.

### Accessing the Dashboard

1. Navigate to: `https://your-app.vercel.app/admin/dashboard`
2. Enter your `KAPSO_WEBHOOK_SECRET` when prompted
3. The secret is stored in your browser's session storage (cleared when you close the tab)

### Dashboard Features

- **Stats Overview**: Total transactions, credits issued, revenue, unique users
- **Transaction List**: Stripe purchases and free-trial grants (deductions are not logged as transactions)
- **Search/Filter**: Filter transactions by phone number
- **Pagination**: Browse through all historical transactions

### Admin API Endpoints

**List all transactions**:
```bash
curl "https://your-app.vercel.app/admin/transactions?limit=50&offset=0" \
  -H "X-Kapso-Webhook-Secret: YOUR_SECRET"
```

**Filter by user**:
```bash
curl "https://your-app.vercel.app/admin/transactions?userId=+15551234567" \
  -H "X-Kapso-Webhook-Secret: YOUR_SECRET"
```

**Get user credits with history**:
```bash
curl "https://your-app.vercel.app/admin/users/+15551234567/credits" \
  -H "X-Kapso-Webhook-Secret: YOUR_SECRET"
```

## Monitoring

### Key Metrics to Track

1. **Credit Sales**: Monitor Stripe dashboard for revenue
2. **Credit Usage**: Check average credits per user
3. **Conversion Rate**: Users who pay vs. bounce
4. **Error Rates**: Monitor 402 errors (insufficient credits)
5. **Webhook Health**: Stripe webhook delivery success rate

### Logs to Monitor

```bash
# Vercel logs
https://vercel.com/your-username/power-assistant-v2/logs

# Look for:
[credits:tryGrantFreeTrial] Granted 1 free trial credit to new user: +15551234567
[credits:addCredits] Added 10 credits to +15551234567
[stripe-webhook] Credits added: {userId, creditsAdded, newBalance}
[transactions:log] Logged transaction cs_xxx for +15551234567
```

## Troubleshooting

### Credits Not Added After Payment
- Check Stripe webhook delivery status
- Verify `STRIPE_WEBHOOK_SECRET` matches
- Check Vercel logs for errors
- Ensure phone number field is configured in Payment Link

### Database Connection Issues
- Verify `REDIS_URL` is set and reachable
- Test with `/health` endpoint

### Negative Credit Balance
- Should never happen due to atomic operations
- If it does, manually reset with admin endpoint
- Investigate logs for race condition

## Future Enhancements

Potential improvements to consider:

1. **Credit Packages**: Multiple tiers (10/$100 MXN, 25/$200 MXN, 50/$350 MXN)
2. **Subscription Model**: Monthly unlimited for $10/month
3. **Referral System**: Give 5 free credits for referrals
4. **Credit Expiration**: Optional expiry after 90 days
5. **Usage Analytics**: Dashboard showing user patterns
6. **Promotional Codes**: Discount codes for marketing
7. **Bulk Discounts**: Lower per-credit cost for larger packages

## Support

For issues or questions:
- Check logs in Vercel dashboard
- Review Stripe webhook delivery status
- Test with admin endpoints
- See testing guide for debugging steps

## Files Modified/Created

### New Files
- `src/db/credits.ts` - Credit management logic
- `src/db/transactions.ts` - Transaction logging for dashboard
- `public/dashboard.html` - Admin dashboard UI
- `docs/setup/STRIPE_SETUP.md` - Stripe configuration guide
- `docs/testing/CREDIT_SYSTEM_TESTS.md` - Testing guide
- `CREDIT_SYSTEM_README.md` - This file

### Modified Files
- `package.json` - Added `redis` and `stripe` dependencies
- `src/server.ts` - Credit checks, free trial, Stripe webhook, admin endpoints, dashboard
- `docs/workflows/KAPSO_WORKFLOW.md` - Canonical deterministic flow documentation

## License

Same as main project (MIT)

