# Kapso Deterministic Workflow — Next Steps (Pick up from Decide node)

You already have:
- A **Decide node** set to **Function (Custom Code)** using the deployed function **`revelio-router`**
- Conditions + labels created:
  - `got_image`
  - `got_style`
  - `help`

This runbook covers everything you still need to do in Kapso to finish the flow.

## Required constraint (do not skip)

Edge labels must match Decide node condition labels **exactly** (same spelling/case):
- `got_image`
- `got_style`
- `help`

If labels don’t match, the execution cannot route correctly.

## Step 0 — Fill in the required condition descriptions

Kapso requires descriptions (even in Function mode). Use:

- `got_image`: `Inbound message contains an image (or an "Image attached ... URL: ..." message). Store it and ask for style 1–10.`
- `got_style`: `User is awaiting style selection and replied with a number 1–10. Proceed to generation.`
- `help`: `No image received yet, or invalid input. Prompt user to send a photo (or reply 1–10 if awaiting).`

Save the Decide node.

## Step 1 — Create the three outgoing edges from the Decide node

Create 3 edges from the Decide node to the next steps, with these labels:

1) **Edge label**: `got_image` → to **Send text** node named `send_menu`
2) **Edge label**: `got_style` → to a **Function node** named `map_style`
3) **Edge label**: `help` → to **Send text** node named `send_help`

## Step 2 — Configure `send_menu` (Send text)

Message body (copy/paste):

```
¡Gracias por tu foto! 📸 Elige un estilo:

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

Responde con el número.
```

After `send_menu`, connect to a **Wait for response** node named `wait_style`.

## Step 3 — Configure `wait_style` (Wait for response)

Goal: pause execution until the user replies with a number.

After `wait_style`, connect back to the **same Decide node** (the router). This makes the flow multi-turn:
- user replies with `1–10`
- Decide node routes to `got_style`

Important: This only works if your router function sets and reads the variable:
- `awaiting_style` (string `"true"` / `"false"`)

Your router function already does that.

## Step 4 — Configure `send_help` (Send text)

Message body:

```
Envíame una foto para empezar. 📸
```

After `send_help`, you can either:
- End the flow, or
- Loop back to `wait_style` (optional). Simpler: end it.

## Step 5 — Add `map_style` (Function node)

This node converts `vars.selected_style_number` (1–10) into `vars.selected_style_key`.

Create a **Kapso Function node** (not Decide) with custom code that:
- reads `vars.selected_style_number`
- writes `vars.selected_style_key`
- if invalid, sets `next_edge` to `invalid_style` (optional) or returns an error message variable

If your Function node supports returning variables directly, use this logic:

```javascript
export async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.vars ?? body?.variables ?? {};

  const n = Number(String(vars?.selected_style_number ?? "").trim());
  const map = {
    1: "artistic",
    2: "cartoon",
    3: "linkedin",
    4: "lego",
    5: "cinematic",
    6: "magazine",
    7: "3d",
    8: "beauty",
    9: "professional",
    10: "santa",
  };

  const key = map[n];

  if (!key) {
    return new Response(
      JSON.stringify({
        vars: { style_error: "true" },
      }),
      { headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      vars: {
        selected_style_key: key,
        style_error: "false",
      },
    }),
    { headers: { "content-type": "application/json" } }
  );
}
```

After `map_style`, add a **Decide node** (or a simple conditional) to check:
- if `vars.style_error == "true"` → send “Responde con un número del 1 al 10” and go back to `wait_style`
- else → proceed to the webhook call

If you want to keep it super simple, you can skip this and assume user sends 1–10; but handling invalid inputs makes it feel polished.

## Step 6 — Add the webhook call to your Vercel backend (generate)

Add a webhook node (or equivalent) named `call_generate`.

### URL
- `https://power-assistant-v2.vercel.app/generate-styled-image`

### Method
- `POST`

### Headers
- `Content-Type: application/json`
- `X-Kapso-Webhook-Secret: <your KAPSO_WEBHOOK_SECRET>`

Important:
- In Kapso’s UI, paste headers as **plain lines** (no `{` / `}` braces).
- If you accidentally shared your secret anywhere, rotate it in Vercel + Kapso.

### JSON body template

Use the stored inbound image message content (contains Kapso URL) and the mapped style key:

```json
{
  "messageContent": "{{vars.pending_image_message}}",
  "style": "{{vars.selected_style_key}}",
  "userId": "{{vars.user_phone_number}}"
}
```

Notes:
- `messageContent` is supported by the backend and auto-extracts the first URL.
- `userId` must be a phone number; backend normalizes it.

### Save Response To (recommended)

In the `call_generate` webhook step, set:

- **Save Response To**: `vars.generate_response`

This lets you reference:
- `{{vars.generate_response.stylizedImageUrl}}`
- `{{vars.generate_response.caption}}`
- `{{vars.generate_response.creditsRemaining}}`

## Step 7 — Normalize the destination phone number (digits only)

The WhatsApp “send message” API expects `to` as digits (no `+`, no spaces).

Create a Kapso Function named (examples):
- `phone-number-digits` (recommended)
- `phone-normalizer`

Kapso Function names must use lowercase letters/numbers/hyphens (no underscores).

Function code:

```javascript
export async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.vars ?? body?.variables ?? {};

  const raw = String(vars.user_phone_number ?? "");
  const digits = raw.replace(/\D/g, "");

  return new Response(
    JSON.stringify({ vars: { user_phone_number_digits: digits } }),
    { headers: { "content-type": "application/json" } }
  );
}
```

Add a **Custom Function** step in the workflow that runs this function before sending the image.

## Step 8 — Send the resulting image (Webhook via Kapso WhatsApp API)

Kapso Flows don’t have a dedicated “Send media” step in the builder menu. To send an image, use a **Webhook** step that calls Kapso’s WhatsApp API.

Create a webhook step named `send_result_image`.

### URL

Use your production WhatsApp config `phone_number_id`:
- `854976904371130`

Endpoint:
- `https://api.kapso.ai/meta/whatsapp/v24.0/854976904371130/messages`

Docs:
- `https://docs.kapso.ai/api/meta/whatsapp/messages/send-a-message`

### Method
- `POST`

### Headers

```http
Content-Type: application/json
X-API-Key: <YOUR_KAPSO_API_KEY>
```

### Body

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{{vars.user_phone_number_digits}}",
  "type": "image",
  "image": {
    "link": "{{vars.generate_response.stylizedImageUrl}}",
    "caption": "{{vars.generate_response.caption}}\n\nTe quedan {{vars.generate_response.creditsRemaining}} créditos."
  }
}
```

## Step 9 — Clear state (optional but recommended)

Add a Function node at the end to clear variables so the next interaction starts clean:
- `pending_image_message = ""`
- `awaiting_style = "false"`
- `selected_style_number = ""`
- `selected_style_key = ""`
- `style_error = "false"`
- `generate_response = {}`

## Quick smoke test checklist

1) Send an image → should immediately show the menu.
2) Reply `2` → should send “Procesando…” (if you add it) and then return an image.
3) Reply `11` → should re-prompt “Responde con un número del 1 al 10”.
4) Send text without image → should say “Envíame una foto para empezar.”


