## End-to-End Test Checklist

Use this script to validate the WhatsApp Image Styler (Revelio / StyleBot) experience before going live.

The bot runs as a **Kapso deterministic flow** (not an Agent node). See `docs/workflows/KAPSO_WORKFLOW.md` for the canonical workflow.

### 1. Local webhook smoke test

1. Copy `env.sample` → `.env` and fill in `GEMINI_API_KEY`, `KAPSO_WEBHOOK_SECRET`, `REDIS_URL`, and `PUBLIC_BASE_URL`.
2. Run `npm install` (first time only) and then `npm run dev`.
3. In a separate terminal, hit the health endpoint:
   ```
   curl http://localhost:4000/health
   ```
   Expect `{ "status": "ok", "database": "connected" }`.
4. Trigger the webhook manually with a sample image (include `userId`):
   ```
   curl -X POST http://localhost:4000/generate-styled-image \
     -H "Content-Type: application/json" \
     -H "X-Kapso-Webhook-Secret: <your secret>" \
     -d '{
       "messageContent": "Image attached ... URL: https://upload.wikimedia.org/wikipedia/commons/2/24/Michael_Phelps_Rio_Olympics_2016.jpg",
       "style": "linkedin",
       "userId": "+15551234567"
     }'
   ```
   You should receive a JSON payload containing `stylizedImageUrl` and `creditsRemaining`. Open the URL in a browser to confirm the image renders.

### 2. Kapso deterministic flow validation

1. In the Kapso builder, ensure the **Deterministic Flow** workflow is published (see `docs/workflows/KAPSO_WORKFLOW.md`).
2. Confirm the generate webhook uses:
   - URL: `https://power-assistant-v2.vercel.app/generate-styled-image`
   - Header: `x-kapso-webhook-secret`
   - Body: `style`, `userId` (`{{context.contact.wa_id}}`), `messageContent` (`{{vars.pending_image_message}}`)
3. Use the sandbox WhatsApp number to send:
   - A selfie or bust-length **photo** → bot shows style menu (1–9)
   - Reply **`2`** for Cartoon → receive stylized image
   - Confirm caption includes remaining credits and payment link
4. In Kapso execution logs, verify:
   - `revelio-router` → `map-style` → generate webhook → `extract-response` → `post-generate-router`
   - On success: WhatsApp send-image webhook fires with `{{vars.image_url}}`
   - On no credits: `needs_payment` branch sends payment message (HTTP 402 handled by `extract-response`)

### 3. Style menu (1–9)

| # | Key | Label |
|--:|-----|-------|
| 1 | `artistic` | Oil Painting |
| 2 | `cartoon` | Cartoon/Anime |
| 3 | `linkedin` | LinkedIn |
| 4 | `lego` | LEGO |
| 5 | `cinematic` | Cinematic B&W |
| 6 | `magazine` | Magazine Cover |
| 7 | `3d` | 3D Character |
| 8 | `beauty` | Beauty Analysis |
| 9 | `professional` | Professional Shoot |

### 4. Credit and payment flow

| Scenario | Expected bot reaction |
| --- | --- |
| Brand-new user, first generation | 1 free trial credit granted (SETNX); image generated; `creditsRemaining: 0` |
| User with 0 credits picks a style | HTTP 402 → payment message with Stripe link; flow stops |
| User completes Stripe payment | +10 credits via webhook; user sends **new photo** to start again |
| User with credits picks valid style | Image sent; credits decremented by 1 |

### 5. Failure-path checks

| Scenario | Expected bot reaction |
| --- | --- |
| User sends text only (no photo) | Help message: "Send me a picture to get started!" |
| User picks invalid style (not 1–9) | Help message or re-prompt |
| Webhook returns 500 | User may not receive image; check Kapso logs and Vercel logs |
| Image URL expired in `messageContent` | 400 from backend; user should send a new photo |

### 6. Pre-launch

- Rotate any API keys shared during testing.
- Confirm `REDIS_URL`, Stripe keys, and `KAPSO_WEBHOOK_SECRET` are set in Vercel Production.
- Run one live test with a friend to confirm international delivery and captioning.

Document any anomalies in the Kapso run logs; they help tune prompts or fallback messaging quickly.
