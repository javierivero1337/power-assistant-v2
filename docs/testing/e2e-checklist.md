## End-to-End Test Checklist

Use this script to validate the WhatsApp Image Styler experience before going live.

### 1. Local webhook smoke test

1. Copy `env.sample` → `.env` and fill in `GEMINI_API_KEY`, `KAPSO_WEBHOOK_SECRET`, and `PUBLIC_BASE_URL`.
2. Run `npm install` (first time only) and then `npm run dev`.
3. In a separate terminal, hit the health endpoint:
   ```
   curl http://localhost:4000/health
   ```
   Expect `{ "status": "ok" }`.
4. Trigger the webhook manually with a sample image URL:
   ```
   curl -X POST http://localhost:4000/generate-styled-image \
     -H "Content-Type: application/json" \
     -H "X-Kapso-Webhook-Secret: <your secret>" \
     -d '{
       "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/2/24/Michael_Phelps_Rio_Olympics_2016.jpg",
       "style": "linkedin"
     }'
   ```
   You should receive a JSON payload containing `stylizedImageUrl`. Open it in a browser to confirm the image renders.

### 2. Kapso workflow validation

1. In the Kapso builder, ensure the workflow is published and the Agent node references the webhook URL (or MCP server entry).
2. Use the sandbox WhatsApp number to send:
   - A selfie or bust-length image.
   - Reply `2` for Cartoon.
   - After receiving the stylized image, reply `5` to reuse the cached photo.
3. In Kapso’s execution logs, verify that:
   - `get_whatsapp_context`, `save_variable`, and `generate_styled_image` fire in order.
   - MCP calls succeed if configured; otherwise the webhook shows 200 responses.

### 3. Failure-path checks

| Scenario | Expected bot reaction |
| --- | --- |
| User sends text only | Ask for a photo, don’t progress. |
| User picks invalid style | Re-prompt with the numbered menu. |
| Webhook responds 500 | Agent sends apology + asks user to retry later. |
| Imagen filters output | Agent surfaces the `raiFilteredReason` and asks for a different pose. |
| Media URL expired | Agent asks the user to resend the image and clears `user_image_url`. |

### 4. Pre-launch

- Rotate the temporary API keys you shared publicly.
- Deploy the webhook (or MCP server) behind HTTPS with TLS certs.
- Update the workflow’s public number routing to the new flow.
- Run one last live test with a friend to confirm international delivery and captioning.

Document any anomalies in the Kapso run logs; they help tune prompts or fallback messaging quickly.

