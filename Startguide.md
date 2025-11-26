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

### 2. Enable Vercel KV (5 minutes)
1. Go to https://vercel.com/dashboard
2. Click on `power-assistant-v2` project
3. Click **Storage** tab
4. Click **Create Database** → **KV**
5. Name: `credits-db`
6. Click **Create** and **Connect to Project**
7. Done! Environment variables are auto-added

### 3. Set Up Stripe (15 minutes)

#### A. Create Product (3 min)
1. Go to https://dashboard.stripe.com/test/products
2. Click **+ Add product**
3. Fill in:
   - Name: `StyleBot Credits - 50 Pack`
   - Description: `50 image generation credits`
   - Price: `$5.00 USD` (One time)
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
4. Add these three variables:


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

**Expected**: `{"userId":"+15559876543","credits":50}`

✅ If you see 50 credits, the Stripe webhook is working!

#### F. Check Stripe Webhook Logs
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click on your webhook
3. Check **Recent deliveries**
4. You should see a `checkout.session.completed` event with status **Succeeded**

### 7. Update Kapso Workflow (10 minutes)
1. Go to https://app.kapso.ai
2. Open your WhatsApp workflow
3. Click on the Agent node
4. Update the webhook tool:
   - Add `userId` as a required parameter
   - Update the tool to extract phone number from WhatsApp context
5. Update the system prompt:
   ```
   When calling generate_styled_image, ALWAYS include the user's 
   WhatsApp phone number as the userId parameter.
   
   If the tool returns HTTP 402 (Insufficient credits):
   - Tell the user: "You need credits! Purchase 50 for $5:"
   - Include the paymentLink from the error response
   - Do NOT retry the request
   
   After successful generation, tell the user how many credits remain.
   ```
6. Save and test in sandbox

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
1. Try to generate an image (will fail - no credits)
2. Click the payment link
3. Pay $5 for 50 credits
4. Generate images (1 credit each)

## What's Next?

### Monitor Your System
- **Stripe Dashboard**: https://dashboard.stripe.com/test/payments
- **Vercel Logs**: https://vercel.com/your-username/power-assistant-v2/logs
- **Health Check**: https://power-assistant-v2.vercel.app/health

### When Ready for Production
1. Complete Stripe business verification
2. Switch from test mode to live mode in Stripe
3. Create new product, payment link, and webhook in live mode
4. Update Vercel environment variables with live keys
5. Test with a real $5 payment

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
- **Vercel dashboard**: https://vercel.com/dashboard
- **Stripe dashboard**: https://dashboard.stripe.com
- **Kapso platform**: https://app.kapso.ai

---

**Need more details?** Check `IMPLEMENTATION_SUMMARY.md` for the complete deployment checklist.

