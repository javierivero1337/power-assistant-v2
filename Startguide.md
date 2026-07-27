# Quick Start Guide - Credit System Deployment

This is a streamlined guide to get your credit system up and running in under an hour.

## Prerequisites
- ✅ Code is already implemented
- ⏳ Vercel account with project deployed
- ⏳ Stripe account (free to sign up)

## Step-by-Step (45-60 minutes)

### 1. Install Dependencies (2 minutes)
```bash
cd /Users/javierrivero/Coding/power-assistant-v2
npm install
```

### 2. Set Up Redis (5 minutes)
Credits are stored in Redis via the `node-redis` client (`REDIS_URL`).

1. Provision a Redis instance (e.g., [Upstash](https://upstash.com) via the Vercel Marketplace, or any Redis provider)
2. Copy the connection URL (format: `redis://...` or `rediss://...`)
3. In Vercel → **Settings** → **Environment Variables**, add:
   - **Name**: `REDIS_URL`
   - **Value**: your Redis connection URL
4. Apply to Production (and Preview if you test there)

### 3. Set Up Stripe (15 minutes)

#### A. Create Product (3 min)
1. Go to https://dashboard.stripe.com/test/products
2. Click **+ Add product**
3. Fill in:
   - Name: `StyleBot Credits - 10 Pack`
   - Description: `10 image generation credits`
   - Price: `$100.00 MXN` (One time)
4. Click **Save product**

#### B. Create Payment Link (5 min)
1. In the product page, scroll to **Payment links**
2. Click **Create payment link**
3. Under **Collect customer information**:
   - Enable **Phone number**
4. Under **Custom fields**, click **Add custom field**:
   - Label: `WhatsApp Phone Number`
   - Type: `Text`
   - Required: ✅ Yes
   - Key: `phone`
5. Under **After payment**:
   - Type: `Show confirmation page`
   - Message: `Thank you! Your credits have been added. Return to WhatsApp to start styling!`
6. Click **Create link**
7. **COPY THE LINK** (looks like: `https://buy.stripe.com/test_xxxxx`)

#### C. Get API Keys (2 min)
1. Go to https://dashboard.stripe.com/test/apikeys
2. Click **Reveal test key** for **Secret key**
3. **COPY IT** (starts with `sk_test_`)

#### D. Create Webhook (5 min)
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **+ Add endpoint**
3. Endpoint URL: `https://power-assistant-v2.vercel.app/stripe-webhook`
4. Description: `StyleBot credits`
5. Click **Select events**
6. Search for and check: `checkout.session.completed`
7. Click **Add events** then **Add endpoint**
8. Click on the webhook you just created
9. Under **Signing secret**, click **Reveal**
10. **COPY IT** (starts with `whsec_`)

### 4. Add Environment Variables to Vercel (5 minutes)
1. Go to https://vercel.com/dashboard
2. Click on `power-assistant-v2`
3. Go to **Settings** → **Environment Variables**
4. Add these variables (Production + Preview as needed):

| Variable | Example / notes |
|----------|-----------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `KAPSO_WEBHOOK_SECRET` | Shared secret for Kapso/admin endpoints (`x-kapso-webhook-secret`) |
| `REDIS_URL` | Redis connection URL (`redis://...` or `rediss://...`) |
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook settings |
| `STRIPE_PAYMENT_LINK` | `https://buy.stripe.com/...` |
| `PUBLIC_BASE_URL` | `https://power-assistant-v2.vercel.app` |
| `PORT` | `4000` (local dev only; Vercel sets this automatically) |
| `NODE_ENV` | `production` (optional) |

5. Click **Save** for each one

### 5. Deploy (2 minutes)
```bash
git add .
git commit -m "Add credit-based payment system"
git push
```

Wait for Vercel to deploy (usually 1-2 minutes). Watch at:
https://vercel.com/your-username/power-assistant-v2

### 6. Test Everything (15 minutes)

#### A. Test Health Check
```bash
curl https://power-assistant-v2.vercel.app/health
```

**Expected**: `{"status":"ok","cachedMedia":0,"database":"connected"}`


#### B. Add Test Credits
```bash
curl -X POST "https://power-assistant-v2.vercel.app/admin/credits/add" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_KAPSO_WEBHOOK_SECRET" \
  -d '{"userId": "+15551234567", "amount": 5}'
```

Replace `YOUR_KAPSO_WEBHOOK_SECRET` with your actual secret.

**Expected**: `{"userId":"+15551234567","newBalance":5}`

#### C. Check Credits
```bash
curl "https://power-assistant-v2.vercel.app/admin/credits/+15551234567" \
  -H "X-Kapso-Webhook-Secret: YOUR_KAPSO_WEBHOOK_SECRET"
```

**Expected**: `{"userId":"+15551234567","credits":5}`

#### D. Test Payment Flow
1. Open your payment link in a browser
2. Fill in:
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - ZIP: `12345`
   - WhatsApp Phone: `+15559876543`
3. Click **Pay**
4. You should see the success message

#### E. Verify Credits Were Added
```bash
curl "https://power-assistant-v2.vercel.app/admin/credits/+15559876543" \
  -H "X-Kapso-Webhook-Secret: YOUR_KAPSO_WEBHOOK_SECRET"
```

**Expected**: `{"userId":"+15559876543","credits":10}`

✅ If you see 10 credits, the Stripe webhook is working!

#### F. Check Stripe Webhook Logs
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click on your webhook
3. Check **Recent deliveries**
4. You should see a `checkout.session.completed` event with status **Succeeded**

### 7. Update Kapso Workflow (10 minutes)
The bot uses a **deterministic flow** (not an Agent node). Follow the canonical setup in [`docs/workflows/KAPSO_WORKFLOW.md`](docs/workflows/KAPSO_WORKFLOW.md):

1. Go to https://app.kapso.ai and open the **Deterministic Flow** workflow
2. Confirm the generate webhook body uses:
   - `"userId": "{{context.contact.wa_id}}"`
   - `"messageContent": "{{vars.pending_image_message}}"`
   - `"style": "{{vars.selected_style_key}}"`
3. Confirm `extract-response` and `post-generate-router` handle HTTP 402 (payment link) vs success
4. Save and test in sandbox: send photo → pick style 1–10 → receive image or payment message

## Troubleshooting


### Credits not added after payment
- Check Stripe webhook delivery logs
- Verify `STRIPE_WEBHOOK_SECRET` matches in Vercel
- Check Vercel logs: https://vercel.com/your-username/power-assistant-v2/logs

### Webhook returns 401 Unauthorized
- Check that you're sending `X-Kapso-Webhook-Secret` header
- Verify the secret matches what's in Vercel

## You're Done! 🎉

Your credit system is now live. Users can:
1. Send a photo and pick a style — **new users get 1 free credit** on their first generation (via Redis SETNX)
2. After free credit is used, purchase 10 credits for $100 MXN via the Stripe payment link
3. Generate images (1 credit each; credits never expire)

## What's Next?

### Monitor Your System
- **Stripe Dashboard**: https://dashboard.stripe.com/test/payments
- **Vercel Logs**: https://vercel.com/your-username/power-assistant-v2/logs
- **Health Check**: https://power-assistant-v2.vercel.app/health
- **Credits Dashboard**: https://power-assistant-v2.vercel.app/admin/dashboard

### When Ready for Production
1. Complete Stripe business verification
2. Switch from test mode to live mode in Stripe
3. Create new product, payment link, and webhook in live mode
4. Update Vercel environment variables with live keys
5. Test with a real $100 MXN payment

### Get Help
- **Detailed docs**: See `CREDIT_SYSTEM_README.md`
- **Testing guide**: See `docs/testing/CREDIT_SYSTEM_TESTS.md`
- **Stripe setup**: See `docs/setup/STRIPE_SETUP.md`

## Quick Reference

### Useful Commands

**Check user credits**:
```bash
curl "https://power-assistant-v2.vercel.app/admin/credits/PHONE_NUMBER" \
  -H "X-Kapso-Webhook-Secret: SECRET"
```

**Add credits manually**:
```bash
curl -X POST "https://power-assistant-v2.vercel.app/admin/credits/add" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: SECRET" \
  -d '{"userId": "PHONE_NUMBER", "amount": 50}'
```

**Health check**:
```bash
curl https://power-assistant-v2.vercel.app/health
```

### Important URLs
- **Your app**: https://power-assistant-v2.vercel.app
- **Credits Dashboard**: https://power-assistant-v2.vercel.app/admin/dashboard
- **Vercel dashboard**: https://vercel.com/dashboard
- **Stripe dashboard**: https://dashboard.stripe.com
- **Kapso platform**: https://app.kapso.ai

---



