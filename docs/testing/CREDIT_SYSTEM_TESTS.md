# Credit System Testing Guide

This document provides comprehensive test scenarios for the credit-based payment system.

## Prerequisites

Before testing, ensure:
- [ ] All dependencies installed (`npm install`)
- [ ] Vercel KV is enabled and configured
- [ ] Stripe is configured (test mode recommended)
- [ ] All environment variables are set in Vercel
- [ ] Application is deployed and accessible

## Environment Setup for Testing

### Local Testing Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Create `.env` file** (for local testing):
   ```bash
   GEMINI_API_KEY=your_gemini_key
   KAPSO_WEBHOOK_SECRET=test_webhook_secret
   STRIPE_SECRET_KEY=sk_test_your_stripe_test_key
   STRIPE_WEBHOOK_SECRET=whsec_test_your_webhook_secret
   STRIPE_PAYMENT_LINK=https://buy.stripe.com/test_xxxxx
   KV_REST_API_URL=your_vercel_kv_url
   KV_REST_API_TOKEN=your_vercel_kv_token
   PORT=4000
   ```

3. **Start local server**:
   ```bash
   npm run dev
   ```

4. **Expose local server** (for Stripe webhooks):
   ```bash
   # Install ngrok if you haven't: https://ngrok.com
   ngrok http 4000
   ```

## Test Scenarios

### 1. Health Check Tests

#### Test 1.1: Basic Health Check
```bash
curl https://power-assistant-v2.vercel.app/health
```

**Expected Response**:
```json
{
  "status": "ok",
  "cachedMedia": 0,
  "database": "connected"
}
```

**Pass Criteria**:
- Status code: 200
- `status` is "ok"
- `database` is "connected"

---

### 2. Admin Endpoint Tests

#### Test 2.1: Check Credits for New User
```bash
curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15551234567" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
```

**Expected Response**:
```json
{
  "userId": "+15551234567",
  "credits": 0
}
```

**Pass Criteria**:
- Status code: 200
- New users start with 0 credits

#### Test 2.2: Manually Add Credits
```bash
curl -X POST "https://power-assistant-v2.vercel.app/admin/credits/add" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "userId": "+15551234567",
    "amount": 50
  }'
```

**Expected Response**:
```json
{
  "userId": "+15551234567",
  "newBalance": 50
}
```

**Pass Criteria**:
- Status code: 200
- Balance increases by specified amount

#### Test 2.3: Verify Credits Were Added
```bash
curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15551234567" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
```

**Expected Response**:
```json
{
  "userId": "+15551234567",
  "credits": 50
}
```

#### Test 2.4: Unauthorized Access (No Secret)
```bash
curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15551234567"
```

**Expected Response**:
```json
{
  "error": "Unauthorized"
}
```

**Pass Criteria**:
- Status code: 401

---

### 3. Image Generation with Credits

#### Test 3.1: Generate Image with Sufficient Credits

First, add credits:
```bash
curl -X POST "https://power-assistant-v2.vercel.app/admin/credits/add" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{"userId": "+15551234567", "amount": 5}'
```

Then generate an image:
```bash
curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "imageUrl": "https://example.com/test-image.jpg",
    "style": "linkedin",
    "userId": "+15551234567"
  }'
```

**Expected Response**:
```json
{
  "stylizedImageUrl": "https://power-assistant-v2.vercel.app/media/xxxxx",
  "caption": "Here's your LinkedIn-ready portrait.",
  "style": "LinkedIn Professional Headshot",
  "creditsRemaining": 4
}
```

**Pass Criteria**:
- Status code: 200
- `stylizedImageUrl` is returned
- `creditsRemaining` is decremented by 1

#### Test 3.2: Verify Credit Deduction
```bash
curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15551234567" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
```

**Expected Response**:
```json
{
  "userId": "+15551234567",
  "credits": 4
}
```

#### Test 3.3: Generate Image with Insufficient Credits

Exhaust all credits first, then try:
```bash
curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "imageUrl": "https://example.com/test-image.jpg",
    "style": "cartoon",
    "userId": "+15551234567"
  }'
```

**Expected Response**:
```json
{
  "error": "Insufficient credits",
  "message": "You need credits to generate images. Purchase 50 credits for $5!",
  "creditsRemaining": 0,
  "paymentLink": "https://buy.stripe.com/test_xxxxx"
}
```

**Pass Criteria**:
- Status code: 402 (Payment Required)
- Error message is clear
- Payment link is provided

#### Test 3.4: Missing userId Parameter
```bash
curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "imageUrl": "https://example.com/test-image.jpg",
    "style": "cinematic"
  }'
```

**Expected Response**:
```json
{
  "error": {
    "fieldErrors": {
      "userId": ["Required"]
    }
  }
}
```

**Pass Criteria**:
- Status code: 400
- Validation error for missing userId

---

### 4. Stripe Payment Flow Tests

#### Test 4.1: Complete Test Payment

1. **Open Payment Link** in browser:
   ```
   https://buy.stripe.com/test_xxxxx
   ```

2. **Fill in payment form**:
   - Card number: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - ZIP: `12345`
   - WhatsApp Phone Number: `+15559876543`

3. **Complete payment**

4. **Check Stripe Dashboard**:
   - Go to Developers → Webhooks
   - Verify `checkout.session.completed` event was sent
   - Status should be "Succeeded"

#### Test 4.2: Verify Credits Were Added After Payment
```bash
curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15559876543" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
```

**Expected Response**:
```json
{
  "userId": "+15559876543",
  "credits": 50
}
```

**Pass Criteria**:
- Credits are exactly 50 (or 50 more than before if user already had credits)

#### Test 4.3: Webhook Signature Verification

Try sending a fake webhook (should fail):
```bash
curl -X POST "https://power-assistant-v2.vercel.app/stripe-webhook" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: fake_signature" \
  -d '{
    "type": "checkout.session.completed",
    "data": {"object": {}}
  }'
```

**Expected Response**:
```json
{
  "error": "Invalid signature"
}
```

**Pass Criteria**:
- Status code: 400
- Webhook rejects invalid signatures

---

### 5. End-to-End User Journey

#### Scenario: New User Complete Flow

1. **New user tries to generate image** (should fail):
   ```bash
   # User has 0 credits
   curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
     -H "Content-Type: application/json" \
     -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
     -d '{
       "imageUrl": "https://example.com/photo.jpg",
       "style": "vintage",
       "userId": "+15558675309"
     }'
   ```
   **Expected**: 402 error with payment link

2. **User completes payment**:
   - Open payment link
   - Complete test payment with phone `+15558675309`

3. **Verify credits added**:
   ```bash
   curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15558675309" \
     -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
   ```
   **Expected**: 50 credits

4. **User generates image** (should succeed):
   ```bash
   curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
     -H "Content-Type: application/json" \
     -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
     -d '{
       "imageUrl": "https://example.com/photo.jpg",
       "style": "vintage",
       "userId": "+15558675309"
     }'
   ```
   **Expected**: Success with `creditsRemaining: 49`

5. **Verify credit deduction**:
   ```bash
   curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15558675309" \
     -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
   ```
   **Expected**: 49 credits

---

### 6. Edge Cases and Error Handling

#### Test 6.1: Concurrent Requests (Race Condition)

Run multiple generation requests simultaneously:
```bash
# Add 5 credits first
curl -X POST "https://power-assistant-v2.vercel.app/admin/credits/add" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{"userId": "+15551111111", "amount": 5}'

# Run 10 concurrent requests (should only succeed 5 times)
for i in {1..10}; do
  curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
    -H "Content-Type: application/json" \
    -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
    -d '{
      "imageUrl": "https://example.com/photo.jpg",
      "style": "cartoon",
      "userId": "+15551111111"
    }' &
done
wait
```

**Pass Criteria**:
- Exactly 5 requests succeed
- 5 requests fail with "Insufficient credits"
- Final balance is 0 (no negative credits)

#### Test 6.2: Invalid Style
```bash
curl -X POST "https://power-assistant-v2.vercel.app/generate-styled-image" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "imageUrl": "https://example.com/photo.jpg",
    "style": "invalid_style",
    "userId": "+15551234567"
  }'
```

**Expected**: 400 error listing supported styles
**Important**: Credits should NOT be deducted for failed validations

#### Test 6.3: Database Connection Failure

Temporarily disable Vercel KV (remove env vars) and test:
```bash
curl https://power-assistant-v2.vercel.app/health
```

**Expected Response**:
```json
{
  "status": "degraded",
  "cachedMedia": 0,
  "database": "disconnected"
}
```

---

## Automated Test Script

Save this as `test-credits.sh`:

```bash
#!/bin/bash

BASE_URL="https://power-assistant-v2.vercel.app"
WEBHOOK_SECRET="your_webhook_secret_here"
TEST_USER="+15551234567"

echo "🧪 Testing Credit System..."

# Test 1: Health Check
echo "\n1️⃣ Health Check"
curl -s "$BASE_URL/health" | jq

# Test 2: Add Credits
echo "\n2️⃣ Adding 5 credits"
curl -s -X POST "$BASE_URL/admin/credits/add" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: $WEBHOOK_SECRET" \
  -d "{\"userId\": \"$TEST_USER\", \"amount\": 5}" | jq

# Test 3: Check Balance
echo "\n3️⃣ Checking balance"
curl -s "$BASE_URL/admin/credits/$TEST_USER" \
  -H "X-Kapso-Webhook-Secret: $WEBHOOK_SECRET" | jq

# Test 4: Generate Image (should succeed)
echo "\n4️⃣ Generating image (should succeed)"
curl -s -X POST "$BASE_URL/generate-styled-image" \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: $WEBHOOK_SECRET" \
  -d "{
    \"imageUrl\": \"https://example.com/photo.jpg\",
    \"style\": \"linkedin\",
    \"userId\": \"$TEST_USER\"
  }" | jq

# Test 5: Check Balance After Generation
echo "\n5️⃣ Checking balance after generation"
curl -s "$BASE_URL/admin/credits/$TEST_USER" \
  -H "X-Kapso-Webhook-Secret: $WEBHOOK_SECRET" | jq

echo "\n✅ Tests complete!"
```

Make it executable and run:
```bash
chmod +x test-credits.sh
./test-credits.sh
```

---

## Test Checklist

### Pre-Deployment Tests
- [ ] Health check returns "ok" status
- [ ] Database connection check works
- [ ] Admin endpoints require authentication
- [ ] Can add credits manually
- [ ] Can check credit balance
- [ ] New users start with 0 credits

### Credit System Tests
- [ ] Image generation succeeds with sufficient credits
- [ ] Credits are deducted after successful generation
- [ ] Image generation fails with insufficient credits (402)
- [ ] Error message includes payment link
- [ ] Missing userId returns validation error
- [ ] Invalid style doesn't deduct credits

### Stripe Integration Tests
- [ ] Test payment completes successfully
- [ ] Webhook receives checkout.session.completed event
- [ ] Credits are added automatically after payment
- [ ] Webhook signature verification works
- [ ] Invalid webhooks are rejected

### Edge Cases
- [ ] Concurrent requests don't create negative balances
- [ ] Credits persist across server restarts (Vercel KV)
- [ ] Large credit amounts work correctly
- [ ] Special characters in userId are handled

### Production Readiness
- [ ] All environment variables configured in Vercel
- [ ] Stripe is in test mode for initial testing
- [ ] Webhook endpoint is accessible from Stripe
- [ ] Error logging is working
- [ ] Payment link is accessible

---

## Troubleshooting

### Credits Not Being Added After Payment
1. Check Vercel logs: `https://vercel.com/your-username/power-assistant-v2/logs`
2. Check Stripe webhook delivery status
3. Verify `STRIPE_WEBHOOK_SECRET` matches
4. Ensure phone number field is configured correctly in Payment Link

### Database Connection Issues
1. Verify Vercel KV is enabled in project settings
2. Check `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set
3. Test connection with health endpoint

### Image Generation Fails
1. Check `GEMINI_API_KEY` is valid
2. Verify image URL is accessible
3. Check Vercel logs for detailed error messages
4. Ensure user has sufficient credits

---

## Next Steps

After all tests pass:
1. [ ] Document any issues found
2. [ ] Fix any bugs discovered
3. [ ] Test with real WhatsApp integration via Kapso
4. [ ] Prepare for production deployment
5. [ ] Switch Stripe to live mode when ready

