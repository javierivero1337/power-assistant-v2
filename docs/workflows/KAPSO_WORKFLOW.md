# Kapso Deterministic Flow — WhatsApp Image Styler

A fully working WhatsApp bot that transforms user photos into AI-styled images using Kapso's deterministic flow (no Agent node).

## Workflow Metadata

| Field | Value |
|-------|-------|
| **ID** | `720ae1a2-0476-42dc-b718-1727ee2ad2c3` |
| **Name** | Deterministic Flow |
| **Status** | Active |
| **Lock Version** | 751 |
| **Message Debounce** | 1 second |
| **Created** | 2025-12-17 |
| **Last Updated** | 2025-12-22 |
| **Connected WhatsApp** | Revelio NN (`862579566949092`) |

---

## Overview

**Flow:**
1. User sends photo → Bot shows style menu (1–9)
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
    ├── got_image → Send Text (style menu) → Wait for Response → back to Decision
    ├── got_style → map-style → Webhook (generate) → extract-response → Decision (post-generate-router)
    │                 ├── needs_payment → Send Text (payment link) → End
    │                 └── got_result → Webhook (send image via WhatsApp API)
    └── help → Send Text ("Send me a picture...") → Wait for Response → back to Decision
```

---

## Style Menu

| # | Key | Label |
|--:|-----|-------|
| 1 | `artistic` | Oil Painting 🎨 |
| 2 | `cartoon` | Cartoon/Anime 👀 |
| 3 | `linkedin` | LinkedIn 💼 |
| 4 | `lego` | LEGO 🧱 |
| 5 | `cinematic` | Cinematic B&W 🎬 |
| 6 | `magazine` | Magazine Cover 📰 |
| 7 | `3d` | 3D Character 🎮 |
| 8 | `beauty` | Beauty Analysis 📊 |
| 9 | `professional` | Professional Shoot 📸 |

---

## Node Summary

### Decision Nodes

| Node ID | Function | Description |
|---------|----------|-------------|
| `decide_1766002833254` | `revelio-router` | Routes based on user input (image/style/help) |
| `decide_1766018124950` | `post-generate-router` | Routes based on payment status after generation |

### Function Nodes

| Node ID | Function | Description |
|---------|----------|-------------|
| `function_1766004096729` | `map-style` | Maps user's numeric selection (1-9) to style key |
| `function_1766015616539` | `extract-response` | Extracts image URL, caption, credits from API response |

### Webhook Nodes

| Node ID | Purpose | URL |
|---------|---------|-----|
| `webhook_1766004490926` | Generate styled image | `https://power-assistant-v2.vercel.app/generate-styled-image` |
| `webhook_1766005263411` | Send image to user | `https://api.kapso.ai/meta/whatsapp/v24.0/862579566949092/messages` |

### Message Nodes

| Node ID | Message |
|---------|---------|
| `send_text_1766094162828` | Style selection menu (9 options) |
| `send_text_1766004233379` | Help message ("Send me a picture...") |
| `send_text_1766095970475` | Payment required message |

### Other Nodes

| Node ID | Type | Description |
|---------|------|-------------|
| `start` | Start | Entry point for the workflow |
| `wait_for_response_1766004330827` | Wait | Waits for user input after sending messages |

---

## Kapso Functions

### 1. `revelio-router` (Decision Node)

**Function ID:** `ba357120-3e76-49d1-8447-d3b92993dc9f`

Routes incoming messages to the appropriate branch.

**Edge labels:** `got_image`, `got_style`, `help`

| Condition | Label | Description |
|-----------|-------|-------------|
| User sent an image | `got_image` | Inbound message contains an image (or "Image attached ... URL: ..."). Store it and ask for style 1–9. |
| User selected a style | `got_style` | User is awaiting style selection and replied with a number 1–9. Proceed to generation. |
| Invalid input | `help` | No image received yet, or invalid input. Prompt user to send a photo (or reply 1–9 if awaiting). |

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
  var isStyleChoice = !isNaN(n) && n >= 1 && n <= 9 && trimmed === String(n);

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

---

### 2. `map-style` (Function Node)

**Function ID:** `135c3e0e-03fd-4dbb-bdc5-4d4b4bbafd42`

Converts style number (1-9) to style key.

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
    9: "professional"
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

**Function ID:** `926bf13a-f1c9-448a-8beb-4af109ab5c32`

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

**Function ID:** `00c0af46-c7d4-49c2-ad5d-be912dc6c248`

Routes based on whether the generation webhook returned a payment requirement.

| Condition | Label | Description |
|-----------|-------|-------------|
| `vars.payment_required == "true"` | `needs_payment` | Payment is required |
| Otherwise | `got_result` | Image was generated successfully |

**Edge labels:** `needs_payment`, `got_result`

---

## Webhook Configurations

### Webhook 1: Generate Styled Image (Vercel Backend)

**Node ID:** `webhook_1766004490926`

| Field | Value |
|-------|-------|
| URL | `https://power-assistant-v2.vercel.app/generate-styled-image` |
| Method | `POST` |
| Save Response To | `vars.generate_response` |

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-kapso-webhook-secret": "YOUR_KAPSO_WEBHOOK_SECRET"
}
```

**Body Template:**
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

**Node ID:** `webhook_1766005263411`

| Field | Value |
|-------|-------|
| URL | `https://api.kapso.ai/meta/whatsapp/v24.0/862579566949092/messages` |
| Method | `POST` |

**Headers:**
```json
{
  "X-API-Key": "<YOUR_KAPSO_API_KEY>",
  "Content-Type": "application/json"
}
```

**Body Template:**
```json
{
  "to": "{{context.contact.wa_id}}",
  "type": "image",
  "image": {
    "link": "{{vars.image_url}}",
    "caption": "{{vars.image_caption}}\n\nYou have {{vars.credits_remaining}} credits left.\n\nGet more credits here: https://buy.stripe.com/bJeeVc6lM1lxgoi8di8bS03"
  },
  "recipient_type": "individual",
  "messaging_product": "whatsapp"
}
```

> **Important:** Use `{{context.contact.wa_id}}` for consistent phone number handling across all regions and workflow steps.

---

## Text Messages

### Style Menu (`send_text_1766094162828`)

Sent after receiving an image from the user.

```
Gracias por enviar tu foto! 📸 

Escoge tu estilo escribiendo SOLO el número!

1. Pintura al óleo 🎨
2. Anime 👀
3. Sesión Profesional LinkedIn 💼
4. LEGO 🧱
5. Sesion profesional blanco y negro 🎬
6. Portada de Revista 📰
7. Personaje Pixar 🎮
8. Analisis de Belleza 📊
9. Sesión Profesional 📸
```

### Help Message (`send_text_1766004233379`)

Sent when user sends invalid input or no image.

```
Send me a picture to get started!  📸
```

### Payment Required (`send_text_1766095970475`)

Sent when user has insufficient credits.

```
Oops! 😅 You need at least 1 credit to generate your image

Get your credits here: 
    {{vars.payment_link}}

After your payment your credits will be added automatically. 

Send a new image when you're ready! 📸
```

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
| `selected_style_number` | User's choice (1-9) |
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

## Workflow Graph (JSON)

The complete workflow graph exported from Kapso:

```json
{
  "nodes": [
    {
      "id": "webhook_1766004490926",
      "type": "flow-node",
      "position": { "x": 120, "y": 700 },
      "data": {
        "node_type": "webhook",
        "config": {
          "url": "https://power-assistant-v2.vercel.app/generate-styled-image",
          "method": "POST",
          "headers": "{\"Content-Type\":\"application/json\",\"x-kapso-webhook-secret\":\"YOUR_KAPSO_WEBHOOK_SECRET\"}",
          "body_template": "{\"style\":\"{{vars.selected_style_key}}\",\"userId\":\"{{context.contact.wa_id}}\",\"messageContent\":\"{{vars.pending_image_message}}\"}",
          "save_response_to": "vars.generate_response"
        },
        "display_name": "Call Webhook"
      }
    },
    {
      "id": "function_1766015616539",
      "type": "flow-node",
      "position": { "x": 160, "y": 880 },
      "data": {
        "node_type": "function",
        "config": {
          "function_id": "926bf13a-f1c9-448a-8beb-4af109ab5c32",
          "function_name": "extract-response",
          "save_response_to": null
        },
        "display_name": "Function: extract-response"
      }
    },
    {
      "id": "webhook_1766005263411",
      "type": "flow-node",
      "position": { "x": 0, "y": 1220 },
      "data": {
        "node_type": "webhook",
        "config": {
          "url": "https://api.kapso.ai/meta/whatsapp/v24.0/862579566949092/messages",
          "method": "POST",
          "headers": "{\"X-API-Key\":\"<YOUR_KAPSO_API_KEY>\",\"Content-Type\":\"application/json\"}",
          "body_template": "{\"to\":\"{{context.contact.wa_id}}\",\"type\":\"image\",\"image\":{\"link\":\"{{vars.image_url}}\",\"caption\":\"{{vars.image_caption}}\\n\\nYou have {{vars.credits_remaining}} credits left.\\n\\nGet more credits here: https://buy.stripe.com/bJeeVc6lM1lxgoi8di8bS03\"},\"recipient_type\":\"individual\",\"messaging_product\":\"whatsapp\"}",
          "save_response_to": null
        },
        "display_name": "Call Webhook"
      }
    },
    {
      "id": "decide_1766002833254",
      "type": "flow-node",
      "position": { "x": 80, "y": 340 },
      "data": {
        "node_type": "decide",
        "config": {
          "decision_type": "function",
          "conditions": [
            {
              "id": "70d49f6e-f90c-4a9e-8dd0-d6ecc31a699f",
              "label": "got_image",
              "description": "Inbound message contains an image (or an \"Image attached ... URL: ...\" message). Store it and ask for style 1–9."
            },
            {
              "id": "175ebcb7-2ec3-4499-adc4-5126e7117a15",
              "label": "got_style",
              "description": "User is awaiting style selection and replied with a number 1–9. Proceed to generation."
            },
            {
              "id": "237becd5-e564-4f1d-86d5-c687e65b9db8",
              "label": "help",
              "description": "No image received yet, or invalid input. Prompt user to send a photo (or reply 1–9 if awaiting)."
            }
          ],
          "function_id": "ba357120-3e76-49d1-8447-d3b92993dc9f",
          "function_name": "revelio-router"
        },
        "display_name": "Decision: Function"
      }
    },
    {
      "id": "decide_1766018124950",
      "type": "flow-node",
      "position": { "x": 160, "y": 1040 },
      "data": {
        "node_type": "decide",
        "config": {
          "decision_type": "function",
          "conditions": [
            {
              "id": "5b2cc22c-ef69-41e1-868d-0d64227df84f",
              "label": "needs_payment",
              "description": "Payment is required (when vars.payment_required equals \"true\")"
            },
            {
              "id": "d35ffb46-31f9-4b65-80d8-b667de587e98",
              "label": "got_result",
              "description": "Payment not required, image was generated successfully"
            }
          ],
          "function_id": "00c0af46-c7d4-49c2-ad5d-be912dc6c248",
          "function_name": "post-generate-router"
        },
        "display_name": "Decision: Function"
      }
    },
    {
      "id": "function_1766004096729",
      "type": "flow-node",
      "position": { "x": 120, "y": 500 },
      "data": {
        "node_type": "function",
        "config": {
          "function_id": "135c3e0e-03fd-4dbb-bdc5-4d4b4bbafd42",
          "function_name": "map-style",
          "save_response_to": null
        },
        "display_name": "Function: map-style"
      }
    },
    {
      "id": "send_text_1766004233379",
      "type": "flow-node",
      "position": { "x": 480, "y": 500 },
      "data": {
        "node_type": "send_text",
        "config": {
          "message": "Send me a picture to get started!  📸",
          "delay_seconds": 0
        },
        "display_name": "Send Text Message"
      }
    },
    {
      "id": "start",
      "type": "flow-node",
      "position": { "x": 80, "y": 160 },
      "data": {
        "node_type": "start",
        "config": {},
        "display_name": "Start"
      }
    },
    {
      "id": "wait_for_response_1766004330827",
      "type": "flow-node",
      "position": { "x": -180, "y": 640 },
      "data": {
        "node_type": "wait_for_response",
        "config": {
          "has_timeout": false,
          "timeout_seconds": null,
          "save_response_to": null
        },
        "display_name": "Wait for Response"
      }
    },
    {
      "id": "send_text_1766094162828",
      "type": "flow-node",
      "position": { "x": -220, "y": 500 },
      "data": {
        "node_type": "send_text",
        "config": {
          "message": "Gracias por enviar tu foto! 📸 \n\nEscoge tu estilo escribiendo SOLO el número!\n\n1. Pintura al óleo 🎨\n2. Anime 👀\n3. Sesión Profesional LinkedIn 💼\n4. LEGO 🧱\n5. Sesion profesional blanco y negro 🎬\n6. Portada de Revista 📰\n7. Personaje Pixar 🎮\n8. Analisis de Belleza 📊\n9. Sesión Profesional 📸",
          "delay_seconds": 0
        },
        "display_name": "Send Text Message"
      }
    },
    {
      "id": "send_text_1766095970475",
      "type": "flow-node",
      "position": { "x": 360, "y": 1220 },
      "data": {
        "node_type": "send_text",
        "config": {
          "message": "Oops! 😅 You need at least 1 credit to generate your image\n\nGet your credits here: \n    {{vars.payment_link}}\n\nAfter your payment your credits will be added automatically. \n\nSend a new image when you're ready! 📸",
          "delay_seconds": 0
        },
        "display_name": "Send Text Message"
      }
    }
  ],
  "edges": [
    {
      "id": "bf2f4c0c-8ba8-4966-88b6-d6edefc58ee5",
      "source": "webhook_1766004490926",
      "target": "function_1766015616539",
      "label": "next"
    },
    {
      "id": "72233b52-cf98-4c03-95f0-b2ee43a68a0b",
      "source": "function_1766015616539",
      "target": "decide_1766018124950",
      "label": "next"
    },
    {
      "id": "9d5ec8e1-5f4c-4490-a8e6-03c4320891b1",
      "source": "decide_1766002833254",
      "target": "function_1766004096729",
      "label": "got_style",
      "flow_condition_id": "175ebcb7-2ec3-4499-adc4-5126e7117a15"
    },
    {
      "id": "f89d40e9-55d2-4d71-8d33-1d70111ea5d8",
      "source": "decide_1766002833254",
      "target": "send_text_1766004233379",
      "label": "help",
      "flow_condition_id": "237becd5-e564-4f1d-86d5-c687e65b9db8"
    },
    {
      "id": "a8a52ace-b687-44ef-8860-fdbf747d78ee",
      "source": "decide_1766002833254",
      "target": "send_text_1766094162828",
      "label": "got_image",
      "flow_condition_id": "70d49f6e-f90c-4a9e-8dd0-d6ecc31a699f"
    },
    {
      "id": "334df9bd-dff0-4eb3-997a-c158eda1ebc0",
      "source": "decide_1766018124950",
      "target": "webhook_1766005263411",
      "label": "got_result",
      "flow_condition_id": "d35ffb46-31f9-4b65-80d8-b667de587e98"
    },
    {
      "id": "ecf4cdcc-69f4-4a03-821c-cb4f81bf9be7",
      "source": "decide_1766018124950",
      "target": "send_text_1766095970475",
      "label": "needs_payment",
      "flow_condition_id": "5b2cc22c-ef69-41e1-868d-0d64227df84f"
    },
    {
      "id": "34a66df4-ff1e-4692-bc55-8c9be754795c",
      "source": "function_1766004096729",
      "target": "webhook_1766004490926",
      "label": "next"
    },
    {
      "id": "8833f9f5-dd25-464f-8971-6eb131cf612f",
      "source": "send_text_1766004233379",
      "target": "wait_for_response_1766004330827",
      "label": "next"
    },
    {
      "id": "5d6c10f2-69c8-44f3-90a6-59f9fe231d04",
      "source": "start",
      "target": "decide_1766002833254",
      "label": "next"
    },
    {
      "id": "ffea0f83-b7f3-4f3d-954f-c8aaa8fbe975",
      "source": "wait_for_response_1766004330827",
      "target": "decide_1766002833254",
      "label": "next"
    },
    {
      "id": "35953195-7900-410e-a4b2-f98aedd083cc",
      "source": "send_text_1766094162828",
      "target": "wait_for_response_1766004330827",
      "label": "next"
    }
  ]
}
```

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

**Success Response (200):**
```json
{
  "stylizedImageUrl": "https://power-assistant-v2.vercel.app/media/abc123",
  "caption": "🎬 Cartoon mode activated!",
  "style": "Cartoon (Anime Style)",
  "creditsRemaining": 7
}
```

**Payment Required Response (402):**
```json
{
  "error": "Insufficient credits",
  "message": "You need at least 1 credit to generate an image",
  "paymentLink": "https://buy.stripe.com/...",
  "creditsRemaining": 0
}
```

**Errors:**
| Status | Description |
|--------|-------------|
| `401` | Missing/invalid `x-kapso-webhook-secret` header |
| `402` | Insufficient credits (includes `paymentLink` in response) |
| `400` | Invalid style or missing image URL in message |

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

*Exported from Kapso Workflows on 2025-12-22*
*Prompt: Make a miniature, full-body, isometric, realistic figurine of this person, wearing ABC, doing XYZ, on a white background, minimal, 4K resolution*
