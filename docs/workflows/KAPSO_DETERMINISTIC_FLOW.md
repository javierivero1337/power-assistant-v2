# Kapso Deterministic Workflow (No Agent Node)

This is the **recommended** Kapso setup for this repo if you’ve seen the Agent node “stall” (no webhook calls / no Vercel logs).

It implements a simple state machine:

1) user sends photo  
2) bot asks for style (1–10)  
3) user replies with a number  
4) bot sends stylized image  

## Why this works better than an Agent node

- The flow is **fully deterministic** (no LLM deciding whether to continue).
- If something fails, you’ll see an error step and/or a webhook response—no silent idle state.

## Important note about Kapso media

In practice, inbound image messages often arrive as a text like:

`Image attached (...) URL: https://app.kapso.ai/rails/active_storage/blobs/redirect/...`

This repo’s backend now supports passing that string directly as `messageContent` and will **extract the URL automatically**.

## Backend endpoints you will call

- `POST /generate-styled-image`
  - Accepts **one of**: `imageBase64`, `imageUrl`, or `messageContent`
  - If you only have Kapso’s “Image attached … URL: …” text, send it as `messageContent`.
- (Optional) `POST /download-image-to-base64`
  - Accepts `imageUrl` or `messageContent`
  - Mostly useful for debugging; you can usually skip this and call `/generate-styled-image` directly.

Both endpoints require header: `X-Kapso-Webhook-Secret: <your secret>`.

## Variables (per user / per execution)

- `user_phone_number` (string)
- `pending_image_message` (string) — store the full inbound image “content” string (it contains the URL)
- `awaiting_style` (string `"true"` / `"false"`)

## Style mapping (1–10)

| # | key |
|---:|---|
| 1 | `artistic` |
| 2 | `cartoon` |
| 3 | `linkedin` |
| 4 | `lego` |
| 5 | `cinematic` |
| 6 | `magazine` |
| 7 | `3d` |
| 8 | `beauty` |
| 9 | `professional` |
| 10 | `santa` |

## Kapso workflow topology (builder)

Use Kapso Flow step types (see the Kapso docs list in `llms.txt`):

- Start
- Decide node
- Send text
- Wait for response
- Function node (optional but recommended for validation/mapping)
- Function node (or Webhook tool) to call your Vercel endpoint
- Send media

### Suggested flow (high level)

1) **Start**
2) **Decide**: “Is inbound message an image?”
   - YES → “Image branch”
   - NO → “Non-image branch”

#### Image branch

3) **Function**: save variables:
   - `pending_image_message = <inbound message content>`
   - `user_phone_number = <from>`
   - `awaiting_style = "true"`
4) **Send text**: show the style menu (1–10)
5) **Wait for response**
6) **Function**: validate response is 1–10 and map to `styleKey`
   - invalid → send text “Responde con un número del 1 al 10” and go back to Wait
7) **Function/Webhook**: call your backend:

```json
{
  "messageContent": "<pending_image_message>",
  "style": "<styleKey>",
  "userId": "<user_phone_number>"
}
```

8) **Send media**: use `stylizedImageUrl` from the backend response + caption
9) **Function**: clear variables:
   - `pending_image_message = ""`
   - `awaiting_style = "false"`

#### Non-image branch

- If `awaiting_style == "true"`: treat the inbound text as the style selection and continue at step 6.
- Else: **Send text**: “Envíame una foto para empezar.”

## Debug checklist

- If you see **no Vercel logs**, the workflow didn’t call your webhook (flow stalled or branch misconfigured).
- If Vercel logs show `Image URL not found`, your `pending_image_message` didn’t include an `https://...` URL.
- If Vercel logs show `Image download failed`, the Kapso URL may have expired or the secret header isn’t being sent.


