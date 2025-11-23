## Agent Node Playbook – Image Styler

This document captures the exact tool-calling logic for the Kapso Agent node so you can mirror it in the visual builder or in JSON exports. Use it together with the workflow and webhook docs.

### Tool sequence overview

| Step | Tool | Purpose |
| --- | --- | --- |
| 1 | `get_whatsapp_context` | Inspect the inbound payload for `media`. If absent, ask the user to resend a photo. |
| 2 | `save_variable` (`user_image_url`) | Store the signed media URL so later steps (style selection, retries) can re-use it. |
| 3 | `send_notification_to_user` | Confirm receipt of the image and introduce the style menu. |
| 4 | `get_variable` | Whenever a new user message arrives, read `user_image_url` to confirm you still have it cached. |
| 5 | — | Parse the user reply. Accept numeric shortcuts or style keywords (case-insensitive). |
| 6 | `save_variable` (`selected_style`) | Persist the normalized enum (`linkedin`, `cartoon`, `cinematic`, `vintage`, `artistic`). |
| 7 | `generate_styled_image` (webhook or MCP tool) | Send `{ imageUrl, style, aspectRatio }` to the Node service. Retry once on 5xx errors. |
| 8 | `send_notification_to_user` | Optional progress ping while Gemini is running (“Polishing your cinematic look…”). |
| 9 | `send_media` | Deliver the stylized image using the returned URL + caption. |
| 10 | `complete_task` | End the flow or branch into another question (“Want to try a different style?”). |

### Sample orchestration pseudo-code

```
if (!has_media) {
  reply("Please send a selfie or bust-length photo so I can style it.");
  wait();
}

save_variable(user_image_url, media.url)
notify("Photo received! Choose a style by number:")
notify("""
1) LinkedIn Professional
2) Cartoon / Anime
3) Cinematic Portrait
4) Vintage Film
5) Artistic Painting
""")

loop until style_valid:
  user_reply = wait_for_message()
  normalized = normalize_style(user_reply)
  if (!normalized) {
    notify("I didn't catch that. Reply with 1-5 or the style name.")
    continue
  }
  save_variable(selected_style, normalized)
  style_valid = true

notify("Working on your " + normalized + " look ⚙️")
response = generate_styled_image({
  imageUrl: get_variable(user_image_url),
  style: normalized
})

if (response.error) {
  notify("The Gemini editor is busy right now. Please try again in a minute.")
  complete_task()
} else {
  send_media(response.stylizedImageUrl, response.caption)
  notify("Want to try another style on the same photo? Reply with the number.")
  // Optionally branch back to the style loop using the cached URL
}
```

### MCP server fallback

If you register the Node service under `mcp_servers`, add this instruction to the system prompt:

> “When the `generate_styled_image` MCP tool is available, prefer it over the webhook. Use the webhook only if the MCP call fails or the server is offline.”

Kapso’s MCP bridge only supports HTTP streaming tools, which the Node server exposes on `/mcp`. Keep both integrations configured so you can switch gradually.

### Error-handling guidance

1. **WhatsApp image expires** – If `generate_styled_image` responds with `410` or a message containing “expired”, ask the user to resend the photo and delete `user_image_url`.
2. **Gemini safety filters** – The webhook returns a `400` with `raiFilteredReason`. Surface it politely (“Google flagged this output for safety. Could you try a different pose?”).
3. **Timeouts** – After 30 s with no webhook response, send a progress update via `send_notification_to_user` and keep waiting. The webhook already retries Imagen internally; avoid double-invocations unless the call definitively failed.

### Validation helper prompt (optional)

Add this short reusable prompt block to the Agent’s instructions so the model always remembers the normalization rules:

```
Valid style keys:
- linkedin → numbers: 1, "linkedin", "professional"
- cartoon → numbers: 2, "cartoon", "anime"
- cinematic → numbers: 3, "cinematic", "movie"
- vintage → numbers: 4, "vintage", "retro", "film"
- artistic → numbers: 5, "artistic", "painting"
If the reply does not match, ask again.
```

With this playbook imported into Kapso’s workflow, the Agent reliably performs all actions needed for the WhatsApp Image Styler experience.

