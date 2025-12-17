## Kapso WhatsApp Image Styler Workflow

This repo originally used a Kapso **Agent node** to orchestrate the chat flow. In practice, that can be flaky (e.g., the agent “idles” and never calls your webhook, so you see **no Vercel logs**).

**Recommended:** use a deterministic Kapso Flow (no Agent node). See `docs/workflows/KAPSO_DETERMINISTIC_FLOW.md`.

---

### 1. Prerequisites

1. **WhatsApp business number** connected to Kapso.
2. **Public endpoint** for the Gemini webhook service (`/generate-styled-image`). You can deploy the Node server in this repo to any HTTPS host.
3. **API keys** stored securely:
   - `KAPSO_API_KEY` (rotate if the sample key was shared publicly).
   - `GEMINI_API_KEY`.
4. Your backend must be deployed (Vercel is fine) and reachable publicly.

---

### 2. Recommended workflow topology (deterministic)

Use Kapso Flow step types (Start / Decide / Wait for response / Function / Send text / Send media) to implement:

- **On inbound image**: store the inbound “Image attached … URL: …” content string and ask for style 1–10
- **On style selection**: call your backend and send the resulting image

The key is: Kapso often provides the image as a Kapso-hosted URL embedded in the inbound message content, not as `media.data`. This backend supports sending that string as `messageContent` and will extract the URL server-side.

---

### 3. Backend payloads

#### 3.1 `/generate-styled-image`

**Request (recommended for Kapso):**

```json
{
  "messageContent": "Image attached (...) URL: https://app.kapso.ai/rails/active_storage/blobs/redirect/...",
  "style": "cartoon",
  "userId": "+523331904491"
}
```

You may also use `imageBase64` + `imageMimeType` if Kapso provides them, but `messageContent` is the most robust with current Kapso behavior.

#### 3.2 `/download-image-to-base64` (optional)

This is useful for testing/debugging or if you want to explicitly “convert URL → base64” in Kapso before calling `/generate-styled-image`:

```json
{
  "messageContent": "Image attached (...) URL: https://app.kapso.ai/rails/active_storage/blobs/redirect/..."
}
```

---

### 4. Testing checklist

1. Use Kapso’s sandbox phone number to send a dummy image (JPEG and PNG).
2. Verify you see Vercel logs for every execution (no silent idle).
3. Verify invalid inputs (not 1–10) loop back to “Wait for response”.
4. Verify insufficient credits (HTTP 402) sends payment link.

