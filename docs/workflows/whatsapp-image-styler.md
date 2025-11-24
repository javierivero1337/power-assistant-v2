## Kapso WhatsApp Image Styler Workflow

This guide explains how to configure a Kapso workflow that receives a user photo over WhatsApp, asks the user to select a style, and returns a stylized image produced with the Gemini Imagen API. It references the Kapso workflow builder docs and Agent node capabilities, including the built-in MCP server hook for tool access. See [Kapso workflows introduction](https://docs.kapso.ai/docs/workflows/introduction) and the [Agent node reference](https://docs.kapso.ai/docs/flows/step-types/agent-node) for background.

---

### 1. Prerequisites

1. **WhatsApp business number** connected to Kapso.
2. **Public endpoint** for the Gemini webhook service (`/generate-styled-image`). You can deploy the Node server in this repo to any HTTPS host.
3. **API keys** stored securely:
   - `KAPSO_API_KEY` (rotate if the sample key was shared publicly).
   - `GEMINI_API_KEY`.
4. Decide whether you want Kapso to reach the webhook via:
   - A **dynamic webhook** tool inside the Agent node.
   - Or the **Kapso MCP server bridge**, which lets the Agent call HTTP-streamable MCP tools. This doc sets up both so you can pick the integration style.

---

### 2. Workflow topology

1. **Start node** (`Incoming WhatsApp Message`).
2. Optional **Filter node** to ensure the inbound payload contains media or text.
3. **Agent node** (`ImageStylerAgent`) that drives the rest of the flow via tools:
   - Reads media metadata.
   - Persists `user_image_url` and `selected_style`.
   - Calls the Gemini stylizer tool (webhook or MCP).
   - Sends status updates (`send_notification_to_user`) and the final image (`send_media`).
4. **Success branch** ends with `complete_task`. Add a failure branch to notify the user when Gemini is unavailable.

Visually the builder should read:

`Incoming Message` → `Agent: Image Styler` → `End / Next Step`.

---

### 3. Agent node configuration

| Field | Value |
| --- | --- |
| `id` | `image_styler_agent` |
| `provider_model_name` | Kapso-supported LLM that handles multi-turn WhatsApp UX (e.g., `gpt-4o-mini` or a Gemini chat model). |
| `temperature` | `0.3` |
| `max_tokens` | `2048` |
| `max_iterations` | `30` |
| `reasoning_effort` | `low` (change if you use o1 models) |

#### System prompt template

```
You are an automated WhatsApp concierge named StyleBot.
Responsibilities:
- Confirm when a user's photo arrives.
- Offer exactly five style options with numeric shortcuts:
  1. LinkedIn Professional Headshot
  2. Cartoon / Anime
  3. Cinematic Portrait
  4. Vintage Film
  5. Artistic Painting
- Accept either a number or the exact style label. Re-prompt for invalid inputs.
- Use the Kapso tools in this order:
  • get_whatsapp_context → capture inbound media metadata AND user's phone number.
  • save_variable / get_variable → persist `user_image_url`, `user_phone_number`, and `selected_style`.
  • generate_styled_image (webhook or MCP) → send {imageUrl, styleKey, userId, aspectRatio, imageSize}.
    IMPORTANT: Always include userId (the user's WhatsApp phone number) in the request.
  • send_notification_to_user → acknowledge progress.
  • send_media → deliver the stylized image. Include the style in the caption.
  • complete_task when delivery succeeds.
- CREDIT SYSTEM HANDLING:
  • If generate_styled_image returns error "Insufficient credits" (HTTP 402):
    - Send a friendly message: "You've used all your credits! 🎨 Purchase 50 more credits for just $5 to continue styling your photos."
    - Include the paymentLink from the error response.
    - Do NOT retry the request.
    - Call complete_task.
  • After successful generation, if creditsRemaining is provided:
    - Include in your response: "You have X credits remaining."
    - If creditsRemaining is low (< 5), remind them they can purchase more.
- If Gemini fails for other reasons, send a friendly apology and suggest trying again later.
- Never expose API keys or internal metadata.
```

You can add localization or brand tone edits, but keep the tool-order instructions intact so actions remain deterministic.

#### Flow variables

| Variable | Description | When set |
| --- | --- | --- |
| `user_image_url` | Temporary, signed media URL returned by WhatsApp via Kapso | Immediately after reading `get_whatsapp_context` |
| `user_phone_number` | User's WhatsApp phone number for credit tracking | Immediately after reading `get_whatsapp_context` |
| `selected_style` | Normalized enum (`linkedin`, `cartoon`, `cinematic`, `vintage`, `artistic`) | After validating the user's reply |

---

### 4. Gemini tool options

#### 4.1 Dynamic webhook tool

1. In the Agent node → **Webhooks** → click *Add Tool*.
2. Name: `generate_styled_image`.
3. Method: `POST`.
4. URL: `https://<your-server>/generate-styled-image`.
5. Authentication: add a custom header `X-Kapso-Webhook-Secret`.
6. Request schema example:
   ```json
   {
     "imageUrl": "string (required)",
     "style": "linkedin | cartoon | cinematic | vintage | artistic",
     "userId": "string (required) - User's WhatsApp phone number",
     "aspectRatio": "optional string, e.g. 1:1",
     "imageSize": "optional string, e.g. 1024x1024"
   }
   ```
7. Expected response schema (success):
   ```json
   {
     "stylizedImageUrl": "https://cdn.example.com/result.jpg",
     "caption": "LinkedIn Professional rendition",
     "creditsRemaining": 42
   }
   ```
8. Expected response schema (insufficient credits - HTTP 402):
   ```json
   {
     "error": "Insufficient credits",
     "message": "You need credits to generate images. Purchase 50 credits for $5!",
     "creditsRemaining": 0,
     "paymentLink": "https://buy.stripe.com/your-link"
   }
   ```

#### 4.2 MCP server hook (optional / future-proof)

Kapso’s Agent node can also talk to **HTTP-streamable MCP servers** ([workflows overview](https://docs.kapso.ai/docs/workflows/introduction)). To enable:

1. Deploy the same Node service and expose an MCP endpoint (extend `src/server.ts` with a `/mcp` handler when you are ready).
2. In the Agent node, add an entry under `mcp_servers`:
   ```json
   {
     "id": "image_styler_mcp",
     "transport": {
       "type": "http",
       "url": "https://<your-server>/mcp"
     }
   }
   ```
3. Register a tool named `generate_styled_image` inside the MCP server (mirrors the webhook schema).
4. Inside the Agent’s orchestration prompt, instruct the model to prefer the MCP tool if available; fall back to the webhook otherwise.

This gives you one integration path that works today (webhook) and a future option when you want richer streaming control through MCP.

---

### 5. Message handling logic

1. **Image reception**
   - Call `get_whatsapp_context`.
   - Guard: if no `media` field, ask the user to send one.
   - Extract and save the user's phone number via `save_variable` as `user_phone_number`.
   - Save the signed `imageUrl` via `save_variable`.
   - Notify the user you received the photo.
2. **Style selection**
   - Present the numbered menu.
   - Parse replies; accept either digits or the style string (case-insensitive).
   - Store the canonical style key with `save_variable`.
3. **Gemini call**
   - Build the payload `{ imageUrl: vars.user_image_url, style: vars.selected_style, userId: vars.user_phone_number }`.
   - Invoke `generate_styled_image`.
   - Handle HTTP 402 (insufficient credits):
     - Extract `paymentLink` from error response.
     - Send message: "You've used all your credits! Purchase 50 more for $5: [link]"
     - Call `complete_task`.
   - Handle other errors: send fallback message + `complete_task`.
4. **Send output**
   - Use `send_media` with the returned URL.
   - Include credits remaining in message: "Here's your <Style Name> look! You have X credits remaining."
   - If credits < 5, add: "Running low? Get 50 more credits for $5: [payment link]"
   - Offer the user a chance to run another style on the same image (skip re-upload by reusing `user_image_url` until TTL expires).

---

### 6. Testing checklist

1. Use Kapso’s sandbox phone number to send a dummy image (JPEG and PNG).
2. Walk through all five style choices to ensure the prompt normalization works.
3. Simulate webhook failure (temporarily stop the server) to verify the Agent surfaces a graceful error.
4. Validate that both webhook and MCP entries appear healthy in Kapso’s workflow logs.
5. Once satisfied, promote the workflow to production and map it to your real WhatsApp entry point.

---

By following this guide you satisfy the first project to-do (“Create a new Kapso WhatsApp workflow and Agent node configured for image-style conversations”) and the setup is ready for the Gemini webhook implementation contained in the rest of the repo.<Double-check assumptions against the official Kapso docs if their MCP server requirements evolve.>

