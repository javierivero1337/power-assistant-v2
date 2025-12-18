# Kapso Manual Setup Guide — Simple Payment Flow (10 credits for $100 MXN)

This guide shows how to implement the **simplest possible** payment flow in Kapso for the workflow described in `docs/workflows/KAPSO_WORKFLOW.md`:

- If the user has credits → generate + send image
- If the user has **no credits** → **send payment link and stop**
- After paying, the user simply **sends a new photo again** (no “resume”, no holding state)

Why this approach:
- Keeps the deterministic workflow easy to reason about
- Avoids holding an image/style while the user pays
- Avoids long “wait loops” and edge cases (timeouts, users saying random things, etc.)

---

## Prerequisites

- Your backend is deployed and includes:
  - `POST /generate-styled-image` (returns **402** with `paymentLink` when credits are 0)
- Kapso webhook secret configured:
  - You will send header `x-kapso-webhook-secret: <YOUR_VERCEL_SECRET>`
- Stripe payment link configured in backend (`STRIPE_PAYMENT_LINK`)
- Pricing in backend is configured as:
  - **10 credits per purchase**
  - **$100 MXN**

---

## What you’ll build (high level)

Inside Kapso you will have these key nodes:

- **Decision**: `revelio-router`
  - `got_image` → show style menu
  - `got_style` → generate
  - `help` → “send me a photo”
- **Function**: `map-style` (number → style key)
- **Webhook**: `generate` (calls your backend)
- **Function**: `extract-response` (extracts `image_url` OR detects `paymentLink`)
- **Decision**: `post-generate-router`
  - `needs_payment` → send payment message (and stop)
  - `got_result` → send image via WhatsApp API

---

## Step-by-step in Kapso

### 1) Confirm your existing nodes still match the baseline

From `docs/workflows/KAPSO_WORKFLOW.md`, you should already have:
- `revelio-router`
- `map-style`
- Webhook “Generate Styled Image” saving to `vars.generate_response`
- `extract-response`
- Webhook “Send Image via WhatsApp”

If any names differ, that’s fine—just keep the logic the same.

---

### 2) Edit the “Generate Styled Image” webhook node

**URL**
- Use your deployed URL:
  - `https://power-assistant-v2.vercel.app/generate-styled-image`

**Method**
- `POST`

**Headers**

```json
{
  "Content-Type": "application/json",
  "x-kapso-webhook-secret": "<YOUR_VERCEL_SECRET>"
}
```

**Body**

```json
{
  "style": "{{vars.selected_style_key}}",
  "userId": "{{vars.user_phone_number}}",
  "messageContent": "{{vars.pending_image_message}}"
}
```

**Save Response To**
- `vars.generate_response`

Important: we intentionally keep this webhook as the “single source of truth”.
If credits are 0, the backend returns a 402 body like:
`{ paymentLink, message, creditsRemaining }`.

---

### 3) Edit/replace your `extract-response` function node

Update the function so it extracts:
- `vars.payment_required` (“true”/“false”)
- `vars.payment_link`
- `vars.payment_message`
- AND normal success output (`image_url`, `image_caption`, `credits_remaining`)

Use this code:

```javascript
export async function handler(request, env) {
  var body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  var executionContext = body.execution_context || {};
  var vars = executionContext.vars || body.vars || {};

  // Kapso stores the response with literal key "vars.generate_response"
  var generateResponse = vars["vars.generate_response"] || vars.generate_response || {};
  var responseBody = generateResponse.body || generateResponse || {};

  // Some webhook implementations store body as a JSON string; be defensive.
  if (typeof responseBody === "string") {
    try { responseBody = JSON.parse(responseBody); } catch (e) {}
  }

  var paymentLink = responseBody.paymentLink || "";
  var paymentRequired =
    !!paymentLink ||
    /insufficient credits/i.test(String(responseBody.error || "")) ||
    /cr[eé]ditos/i.test(String(responseBody.message || ""));

  return new Response(
    JSON.stringify({
      vars: {
        image_url: responseBody.stylizedImageUrl || "",
        image_caption: responseBody.caption || "",
        credits_remaining: String(responseBody.creditsRemaining || 0),
        payment_required: paymentRequired ? "true" : "false",
        payment_link: paymentLink,
        payment_message: responseBody.message || ""
      }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
```

---

### 4) Add a Decision node: `post-generate-router`

Create a new **Decision** node right after `extract-response`.

**Routing rules**
- If `vars.payment_required == "true"` → edge `needs_payment`
- Else → edge `got_result`

Edge labels:
- `needs_payment`
- `got_result`

---

### 5) Create the “needs_payment” message node (and STOP here)

From `needs_payment`, add a **Send Text** node.

Use a short, clear message:

```
Uff 😅 para generar tu imagen necesitas créditos.

Compra 10 créditos por $100 MXN aquí:
{{vars.payment_link}}

Cuando termines, vuelve a mandarme una foto para empezar. 📸
```

After this node:
- **End the flow** (do not add “Wait for Response” or “LISTO” handling).

This is the “simple” version you asked for: pay → come back later → send new photo.

---

### 6) Wire “got_result” to your existing WhatsApp send-image webhook

From `got_result`, connect to your existing “Send Image via WhatsApp (Kapso API)” webhook node.

Make sure its body still uses:
- `{{vars.image_url}}`
- `{{vars.image_caption}}`
- `{{vars.credits_remaining}}`

Example caption:
```
{{vars.image_caption}}

Te quedan {{vars.credits_remaining}} créditos.
```

---

## Testing checklist (manual)

## Final validation (the one thing that can break this flow)

Your backend returns **HTTP 402** when the user has 0 credits.

Some workflow tools (sometimes Kapso too, depending on settings) will treat any non-200 response like a “hard error” and stop the flow immediately.

We need to confirm Kapso still lets your workflow continue to the next nodes (so you can show the payment link message).

### Validation step: does the flow continue after a 402?

1. Make sure your test phone has **0 credits**.
2. In WhatsApp, send a photo → pick a style.
3. Look at the Kapso run/execution:
   - **PASS** (good): after the generate webhook runs, you still reach `extract-response` → `post-generate-router` → the “needs_payment” **Send Text** node runs and the user receives the payment link.
   - **FAIL**: Kapso shows the webhook as failed and the workflow stops before your “needs_payment” message is sent.

### If it FAILS

Don’t overcomplicate Kapso. The clean fix is on the backend:

- Add a tiny wrapper endpoint that **always returns HTTP 200**, with a body like:
  - `{ paymentRequired: true, paymentLink: "..." }` instead of using HTTP 402

Then Kapso can route on `paymentRequired` without being blocked by HTTP status codes.

If you confirm it fails in your Kapso run logs, tell me and I’ll implement the wrapper endpoint + update this guide with the exact new webhook URL/body/variables.

### Test A: No credits
- Ensure a test user has 0 credits (via admin API)
- Send photo → select style
- Expected:
  - You receive the payment message with a valid `{{vars.payment_link}}`
  - Flow stops (no further prompts)

### Test B: After payment
- Complete Stripe payment using the same WhatsApp phone number field
- Send a new photo again → select style
- Expected:
  - Image is generated and sent
  - Caption includes remaining credits (should go from 10 → 9 after first generation)

---

## Common gotchas

- **Payment link empty**
  - Backend may be missing `STRIPE_PAYMENT_LINK`
  - Or webhook secret mismatch (you might be getting a 401 instead of 402)

- **Credits don’t increase after payment**
  - Stripe webhook not configured or failing signature verification
  - Phone number field key doesn’t match what backend expects (`phone` or `whatsapp_number`)

- **Kapso webhook node fails on 402**
  - Some tools treat non-2xx as “failed webhook”.
  - If you see that behavior, tell me: we can add a tiny backend wrapper endpoint that always returns 200 with `{ paymentRequired: true, paymentLink: ... }`.


