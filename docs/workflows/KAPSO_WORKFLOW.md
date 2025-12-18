# Kapso Deterministic Workflow — WhatsApp Image Styler

A fully working WhatsApp bot that transforms user photos into AI-styled images using Kapso's deterministic flow (no Agent node).

## Overview

**Flow:**
1. User sends photo → Bot shows style menu (1–10)
2. User replies with number → Bot generates styled image via Gemini AI
3. Bot sends styled image back via WhatsApp

**Why deterministic?** Agent nodes can "idle" and never call webhooks. A deterministic flow guarantees execution and makes debugging straightforward.

---

## Architecture

```
WhatsApp User
     ↓
Kapso (Deterministic Flow)
     ↓
Vercel Backend (/generate-styled-image)
     ↓
Google Gemini AI (image generation)
     ↓
Kapso WhatsApp API (send result)
     ↓
WhatsApp User
```

---

## Flow Diagram

```
Start (WhatsApp inbound)
    ↓
Decision (revelio-router)
    ├── got_image → Send Text (menu) → Wait for Response → back to Decision
    ├── got_style → map-style → Send Text ("Perfecto...") → Webhook (generate) → extract-response → Decision (post-generate-router)
    │                 ├── needs_payment → Send Text (payment link) → End (user buys and comes back later)
    │                 └── got_result → Webhook (send image)
    └── help → Send Text ("Envíame una foto...")
```

---

## Style Menu

| # | Key | Label |
|--:|-----|-------|
| 1 | `artistic` | Pintura al Óleo 🎨 |
| 2 | `cartoon` | Caricatura/Anime 👀 |
| 3 | `linkedin` | LinkedIn 💼 |
| 4 | `lego` | LEGO 🧱 |
| 5 | `cinematic` | Cinematográfico B&W 🎬 |
| 6 | `magazine` | Portada Revista 📰 |
| 7 | `3d` | Caricatura 3D 🎮 |
| 8 | `beauty` | Análisis Belleza 📊 |
| 9 | `professional` | Sesión Profesional 📸 |
| 10 | `santa` | Foto con Santa 🎅🏻 |

---

## Kapso Functions

### 1. `revelio-router` (Decision Node)

Routes incoming messages to the appropriate branch.

```javascript
export async function handler(request, env) {
  var body = {};
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }

  var availableEdges = body.available_edges || [];
  var executionContext = body.execution_context || {};
  var vars = executionContext.vars || body.vars || {};

  var messageText = vars.last_user_input || "";
  var awaitingStyle = vars.awaiting_style === "true" || vars.awaiting_style === true;

  var nextEdge = "help";
  var updatedVars = {};

  // Copy all existing vars
  for (var key in vars) {
    updatedVars[key] = vars[key];
  }

  var trimmed = messageText.trim();
  var n = parseInt(trimmed, 10);
  var isStyleChoice = !isNaN(n) && n >= 1 && n <= 10 && trimmed === String(n);

  if (awaitingStyle && isStyleChoice) {
    nextEdge = "got_style";
    updatedVars.selected_style_number = String(n);
  } else if (/image attached/i.test(messageText) && /https?:\/\//i.test(messageText)) {
    nextEdge = "got_image";
    updatedVars.pending_image_message = messageText;
    updatedVars.awaiting_style = "true";
  } else {
    nextEdge = "help";
  }

  if (availableEdges.length > 0 && availableEdges.indexOf(nextEdge) === -1) {
    nextEdge = availableEdges[0] || "help";
  }

  return new Response(
    JSON.stringify({
      next_edge: nextEdge,
      vars: updatedVars
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
```

> **Note:** This router no longer needs to track `user_phone_number` since we use `{{context.contact.wa_id}}` directly in webhooks, which is always available from Kapso's execution context.

**Edge labels:** `got_image`, `got_style`, `help`

---

### 2. `map-style` (Function Node)

Converts style number (1-10) to style key.

```javascript
export async function handler(request, env) {
  var body = {};
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }

  var executionContext = body.execution_context || {};
  var vars = executionContext.vars || body.vars || {};

  var rawValue = vars.selected_style_number || "";
  var n = parseInt(String(rawValue).trim(), 10);

  var styleMap = {
    1: "artistic",
    2: "cartoon",
    3: "linkedin",
    4: "lego",
    5: "cinematic",
    6: "magazine",
    7: "3d",
    8: "beauty",
    9: "professional",
    10: "santa"
  };

  var key = styleMap[n];

  if (!key) {
    return new Response(
      JSON.stringify({ vars: { style_error: "true" } }),
      { headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      vars: {
        selected_style_key: key,
        style_error: "false"
      }
    }),
    { headers: { "content-type": "application/json" } }
  );
}
```

---

### 3. `extract-response` (Function Node)

Extracts nested webhook response into flat variables (Kapso quirk: stores responses with literal key `vars.generate_response`).

```javascript
export async function handler(request, env) {
  var body = {};
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }

  var executionContext = body.execution_context || {};
  var vars = executionContext.vars || body.vars || {};

  // Kapso stores the response with literal key "vars.generate_response"
  var generateResponse = vars["vars.generate_response"] || vars.generate_response || {};
  var responseBody = generateResponse.body || generateResponse || {};

  // If payment is required, backend returns 402 with { paymentLink, message, creditsRemaining }
  // Some Kapso webhook implementations store body as a string; be defensive.
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

### 4. `post-generate-router` (Decision Node)

Routes based on whether the generation webhook returned a payment requirement.

- If `vars.payment_required == "true"` → `needs_payment`
- Else → `got_result`

**Edge labels:** `needs_payment`, `got_result`

## Webhook Configurations

### Webhook 1: Generate Styled Image (Vercel Backend)

| Field | Value |
|-------|-------|
| URL | `https://power-assistant-v2.vercel.app/generate-styled-image` |
| Method | `POST` |
| Headers | See below |
| Body | See below |
| Save Response To | `vars.generate_response` |

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-kapso-webhook-secret": "<YOUR_VERCEL_SECRET>"
}
```

**Body:**
```json
{
  "style": "{{vars.selected_style_key}}",
  "userId": "{{context.contact.wa_id}}",
  "messageContent": "{{vars.pending_image_message}}"
}
```

> **Important:** Use `{{context.contact.wa_id}}` instead of `{{vars.user_phone_number}}` to ensure the phone number is always available. This built-in Kapso variable persists reliably across all workflow steps and works with all phone number formats (US, Mexico, etc.). The backend normalizes the format automatically.

---

### Webhook 2: Send Image via WhatsApp (Kapso API)

| Field | Value |
|-------|-------|
| URL | `https://api.kapso.ai/meta/whatsapp/v24.0/<PHONE_NUMBER_ID>/messages` |
| Method | `POST` |
| Headers | See below |
| Body | See below |

**Headers:**
```json
{
  "Content-Type": "application/json",
  "X-API-Key": "<YOUR_KAPSO_API_KEY>"
}
```

**Body:**
```json
{
  "to": "{{context.contact.wa_id}}",
  "type": "image",
  "image": {
    "link": "{{vars.image_url}}",
    "caption": "{{vars.image_caption}}\n\nTe quedan {{vars.credits_remaining}} créditos."
  },
  "recipient_type": "individual",
  "messaging_product": "whatsapp"
}
```

> **Important:** Use `{{context.contact.wa_id}}` for consistent phone number handling across all regions and workflow steps.

---

## Variables Reference

### Kapso Built-in Context Variables

| Variable | Description |
|----------|-------------|
| `context.contact.wa_id` | **User's WhatsApp phone number** (always available, use this in webhooks) |
| `context.contact.profile_name` | User's WhatsApp profile name |

### Custom Workflow Variables

| Variable | Description |
|----------|-------------|
| `pending_image_message` | Full inbound message containing image URL |
| `awaiting_style` | `"true"` when waiting for style selection |
| `selected_style_number` | User's choice (1-10) |
| `selected_style_key` | Mapped style key (e.g., `artistic`) |
| `vars.generate_response` | Webhook response from image generation |
| `image_url` | Extracted stylized image URL |
| `image_caption` | Extracted caption |
| `credits_remaining` | User's remaining credits |
| `payment_required` | `"true"` when backend returns payment requirement |
| `payment_link` | Stripe payment link from backend |
| `payment_message` | Human-readable payment message from backend |

> **Note:** Always use `{{context.contact.wa_id}}` for phone numbers in webhook configurations. Custom variables like `user_phone_number` may not persist reliably between workflow steps.

---

## Kapso Payload Structure

Kapso sends data in specific locations:

| Data | Location |
|------|----------|
| User's latest message | `body.execution_context.vars.last_user_input` |
| Stored variables | `body.execution_context.vars` |
| Contact info | `body.execution_context.context.contact` |
| Phone number | `body.execution_context.context.contact.wa_id` |
| Available edges | `body.available_edges` |

**Important:** Webhook responses are stored with the literal key `vars.generate_response` (with the dot), not just `generate_response`.

---

## Text Messages

### Style Menu (after receiving image)
```
Gracias por tu foto! 📸 Elige un estilo:

1. Pintura al Óleo 🎨
2. Caricatura/Anime 👀
3. LinkedIn 💼
4. LEGO 🧱
5. Cinematográfico B&W 🎬
6. Portada Revista 📰
7. Caricatura 3D 🎮
8. Análisis Belleza 📊
9. Sesión Profesional 📸
10. Foto con Santa 🎅🏻

Responde con el número únicamente
```

### Payment Required (after user chose style)
```
Uff 😅 para generar tu imagen necesitas créditos.

Compra 10 créditos por $100 MXN aquí:
{{vars.payment_link}}

Cuando termines de pagar, responde: LISTO ✅
(no hace falta reenviar la foto)
```

### Help Message (no image)
```
Envíame una foto para empezar. 📸
```

---

## Debugging

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 401 Unauthorized | Missing/wrong auth header | Add `x-kapso-webhook-secret` header |
| 400 "userId is required" | Empty userId in webhook | Use `{{context.contact.wa_id}}` instead of custom variables |
| 500 Function error | Syntax error or undefined variable | Use `var` instead of `const`, wrap in try/catch |
| Variables not resolving | Wrong variable path | Check `execution_context.vars` structure |
| Image URL empty | Nested response not extracted | Use `extract-response` function |
| 24-hour window error | Session expired | User must message first to reopen window |
| Credits showing 0 | Phone number format mismatch | Ensure phone format matches Redis key |
| Image not sent after style selection | Custom variable not persisting | Use `{{context.contact.wa_id}}` in webhooks |

### Debug Checklist

1. **No Vercel logs?** → Flow didn't reach webhook (check routing)
2. **401 error?** → Check webhook headers
3. **400 "userId is required"?** → Verify webhooks use `{{context.contact.wa_id}}`
4. **Empty variables?** → Check variable paths in Kapso payload
5. **Image not sent?** → Check Webhook 2 body and WhatsApp API response
6. **User has credits but still fails?** → Check phone number is being sent correctly

---

## Backend Endpoints

### `POST /generate-styled-image`

Generates a styled image using Gemini AI.

**Request:**
```json
{
  "messageContent": "Image attached ... URL: https://...",
  "style": "cartoon",
  "userId": "523331904491"
}
```

**Response:**
```json
{
  "stylizedImageUrl": "https://power-assistant-v2.vercel.app/media/abc123",
  "caption": "🎬 ¡Modo caricatura activado!",
  "style": "Cartoon (Anime Style)",
  "creditsRemaining": 7
}
```

**Errors:**
- `401` - Missing/invalid auth header
- `402` - Insufficient credits (includes `paymentLink`)
- `400` - Invalid style or missing image

---

## Best Practices

### 1. Use Kapso Built-in Context Variables

✅ **Do:**
```json
{
  "userId": "{{context.contact.wa_id}}",
  "to": "{{context.contact.wa_id}}"
}
```

❌ **Don't:**
```json
{
  "userId": "{{vars.user_phone_number}}",
  "to": "{{vars.user_phone_number}}"
}
```

**Why:** Kapso's built-in context variables (`context.contact.wa_id`, `context.contact.profile_name`, etc.) are always available and persist reliably across all workflow steps. Custom variables may not persist between branches or after certain nodes.

### 2. Phone Number Format

- Kapso's `context.contact.wa_id` provides the phone number without the `+` prefix (e.g., `19172545384`)
- The backend's `normalizePhoneNumber()` function automatically adds the `+` prefix and handles regional variations
- Works consistently for all countries (US: `19172545384` → `+19172545384`, Mexico: `523331904491` → `+523331904491`)

### 3. Testing Across Regions

Always test your workflow with phone numbers from different countries:
- US numbers: `+1XXXXXXXXXX`
- Mexico numbers: `+52XXXXXXXXXX`
- Other regions as needed

### 4. Error Handling

- Check webhook execution logs in Kapso for detailed error information
- Verify webhook responses are being extracted correctly by `extract-response`
- Use the admin endpoints to verify credit balances and transactions

### 5. Variable Persistence

If you need to store custom data across workflow steps:
- ✅ Store in `vars` and ensure they're copied in function nodes
- ✅ Use `extract-response` to flatten nested webhook responses
- ❌ Don't rely on variables persisting automatically between branches

---
