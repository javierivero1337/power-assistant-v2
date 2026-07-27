# Stripe Setup Guide

This guide walks you through setting up Stripe to accept payments for the credit system.

## Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Your deployed webhook URL (e.g., `https://power-assistant-v2.vercel.app`)

## Step-by-Step Setup

### 1. Create a Product

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Products** in the left sidebar
3. Click **+ Add product**
4. Fill in the details:
   - **Name**: `StyleBot Credits - 10 Pack`
   - **Description**: `10 image generation credits for StyleBot WhatsApp service`
   - **Pricing**: 
     - **Price**: `$20.00 MXN`
     - **Billing period**: `One time`
5. Click **Save product**

### 2. Create a Payment Link

1. In the product page, scroll to **Payment links** section
2. Click **Create payment link**
3. Configure the payment link:
   - **Collect customer information**: Enable **Phone number** (required)
   - **Custom fields**: Add a custom field
     - **Label**: `WhatsApp Phone Number`
     - **Type**: `Text`
     - **Required**: Yes
     - **Key**: `phone` (this will be used in the webhook)
   - **After payment**: 
     - **Type**: `Show confirmation page`
     - **Custom message**: `Thank you! Your credits have been added. Return to WhatsApp to start styling!`
4. Click **Create link**
5. **Copy the Payment Link URL** - you'll need this for the `STRIPE_PAYMENT_LINK` environment variable

Example Payment Link format: `https://buy.stripe.com/test_xxxxxxxxxxxxx`

### 3. Get Your API Keys

1. In Stripe Dashboard, navigate to **Developers** → **API keys**
2. Copy your **Secret key** (starts with `sk_test_` for test mode or `sk_live_` for production)
3. Save this as `STRIPE_SECRET_KEY` environment variable in Vercel

**Important**: Never commit API keys to git. Always use environment variables.

### 4. Set Up Webhook Endpoint

1. In Stripe Dashboard, navigate to **Developers** → **Webhooks**
2. Click **+ Add endpoint**
3. Configure the webhook:
   - **Endpoint URL**: `https://power-assistant-v2.vercel.app/stripe-webhook`
   - **Description**: `StyleBot credit fulfillment`
   - **Events to send**: 
     - Click **Select events**
     - Search for and select: `checkout.session.completed`
     - Click **Add events**
4. Click **Add endpoint**
5. After creation, click on the webhook to view details
6. Under **Signing secret**, click **Reveal** and copy the secret (starts with `whsec_`)
7. Save this as `STRIPE_WEBHOOK_SECRET` environment variable in Vercel

### 5. Configure Environment Variables in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (`power-assistant-v2`)
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

| Variable Name | Value | Example |
|---------------|-------|---------|
| `REDIS_URL` | Redis connection URL | `rediss://default:...@...upstash.io:6379` |
| `STRIPE_SECRET_KEY` | Your Stripe secret key | `sk_test_51Abc...` |
| `STRIPE_WEBHOOK_SECRET` | Your webhook signing secret | `whsec_xyz...` |
| `STRIPE_PAYMENT_LINK` | Your payment link URL | `https://buy.stripe.com/test_...` |

5. Click **Save** for each variable
6. Redeploy your application for changes to take effect

### 6. Test the Integration

#### Test Mode (Recommended First)

1. Ensure you're using **test mode** API keys (they start with `sk_test_` and `whsec_test_`)
2. Use Stripe's test card numbers:
   - **Success**: `4242 4242 4242 4242`
   - **Decline**: `4000 0000 0000 0002`
   - **Any future expiry date** (e.g., `12/34`)
   - **Any 3-digit CVC** (e.g., `123`)
   - **Any ZIP code** (e.g., `12345`)

#### Testing Steps

1. **Test the payment flow**:
   - Open your Payment Link in a browser
   - Enter test card details
   - For "WhatsApp Phone Number", enter: `+15551234567`
   - Complete the payment
   
2. **Verify webhook received**:
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click on your webhook endpoint
   - Check the **Recent deliveries** section
   - You should see a `checkout.session.completed` event with status `Succeeded`

3. **Verify credits were added**:
   ```bash
   # Check user credits via admin endpoint
   curl -X GET "https://power-assistant-v2.vercel.app/admin/credits/+15551234567" \
     -H "X-Kapso-Webhook-Secret: YOUR_WEBHOOK_SECRET"
   
   # Expected response:
   # {"userId":"+15551234567","credits":10}
   ```

4. **Test idempotency** (optional):
   - Re-deliver the same `checkout.session.completed` event from Stripe Dashboard
   - Credits should **not** increase again (dedup via `stripe:processed:{sessionId}` in Redis)

5. **Test credit deduction**:
   - Use the Kapso WhatsApp bot to generate an image
   - Check credits again - should be 9

#### Troubleshooting

**Webhook not receiving events:**
- Check that your Vercel deployment is live
- Verify the webhook URL is correct (no typos)
- Check Vercel logs for errors: `https://vercel.com/your-username/power-assistant-v2/logs`
- In Stripe Dashboard, check webhook delivery attempts for error details

**Credits not being added:**
- Check Vercel logs for the `/stripe-webhook` endpoint
- Verify the phone number field is being captured correctly
- Ensure `STRIPE_WEBHOOK_SECRET` matches between Stripe and Vercel

**Payment link not working:**
- Ensure the product is active in Stripe
- Check that the payment link hasn't been deleted or disabled
- Verify you're using the correct mode (test vs. live)

### 7. Go Live (Production)

When you're ready to accept real payments:

1. **Activate your Stripe account**:
   - Complete business verification in Stripe Dashboard
   - Add bank account details for payouts

2. **Switch to live mode**:
   - In Stripe Dashboard, toggle from **Test mode** to **Live mode**
   - Create a new product (same as test, but in live mode)
   - Create a new payment link (in live mode)
   - Get new live API keys (`sk_live_...`)
   - Create new webhook endpoint (in live mode)

3. **Update Vercel environment variables**:
   - Replace test keys with live keys
   - Update `STRIPE_PAYMENT_LINK` with live payment link
   - Redeploy

4. **Test with a real card** (small amount):
   - Make a real $20 MXN purchase to verify everything works
   - Check that credits are added correctly
   - Refund the test transaction if needed

## Pricing Configuration

Current setup:
- **Package**: 10 credits for $20.00 MXN
- **Cost per generation**: 1 credit
- **Free trial**: 1 free credit for new users (granted on first `/generate-styled-image` call via Redis SETNX)
- **Credit expiration**: None (credits never expire)
- **Webhook idempotency**: Duplicate `checkout.session.completed` events are ignored via `stripe:processed:{sessionId}` in Redis

To change pricing:
1. Create a new product in Stripe with different pricing
2. Create a new payment link
3. Update `STRIPE_PAYMENT_LINK` environment variable
4. Update the credit amount in `/stripe-webhook` endpoint (currently hardcoded to 10)

## Security Best Practices

1. **Never commit secrets**: Always use environment variables
2. **Rotate keys regularly**: Especially if they're exposed
3. **Use webhook signatures**: Always verify `stripe-signature` header (already implemented)
4. **Monitor webhook logs**: Check for suspicious activity
5. **Set up alerts**: Configure Stripe to email you about important events
6. **Use test mode extensively**: Don't test with real money

## Support

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Support**: https://support.stripe.com
- **Test Cards**: https://stripe.com/docs/testing

## Checklist

- [ ] Stripe account created and verified
- [ ] Product created: "StyleBot Credits - 10 Pack" at $20 MXN
- [ ] Payment link created with custom phone number field
- [ ] API keys copied to Vercel environment variables
- [ ] Webhook endpoint created and configured
- [ ] Webhook secret copied to Vercel
- [ ] Test payment completed successfully
- [ ] Credits added to test user
- [ ] Credit deduction tested
- [ ] Ready for production (optional)

