# Example: Adding "Vintage Film" Style

This is a complete walkthrough showing how to add a new style in under 5 minutes.

## Step 1: Edit `src/styles/presets.ts`

### 1.1 Add to StyleKey type (line 12):

```typescript
export type StyleKey =
  | 'artistic'
  | 'cartoon'
  | 'linkedin'
  | 'lego'
  | 'cinematic'
  | 'magazine'
  | '3d'
  | 'beauty'
  | 'professional'
  | 'vintage';  // ← NEW
```

### 1.2 Add to STYLE_PRESETS (after line 95):

```typescript
vintage: {
  key: 'vintage',
  label: 'Vintage Film',
  prompt:
    'Using the provided image, transform this portrait into a vintage analog film photograph from the 1970s. Apply warm, slightly faded colors with a subtle orange/teal color grade. Add natural film grain texture, slight vignetting around the edges, and soft focus characteristic of vintage lenses. The lighting should be natural and warm, reminiscent of Kodak Portra 400 film stock. Include subtle light leaks and a nostalgic, timeless quality.',
  aspectRatio: '3:4',
  captionTemplate: '📸 Viaje al pasado con estilo vintage.',
},
```

### 1.3 Add aliases (after line 160):

```typescript
// Vintage
'10': 'vintage',
vintage: 'vintage',
vintagge: 'vintage',  // common typo
retro: 'vintage',
'vintage film': 'vintage',
'film vintage': 'vintage',
'70s': 'vintage',
```

## Step 2: Update Kapso Prompt

Edit `docs/workflows/UPDATED_AGENT_PROMPT.md`:

### In the menu section (line 22):

```markdown
  10. Vintage Film 📸 (vintage)
```

### In the caption section (line 93):

```markdown
   - vintage: "📸 Viaje al pasado con estilo vintage."
```

### In the aliases section (line 111):

```markdown
- vintage → acepta: "10", "vintage", "retro", "vintage film", "film vintage", "70s"
```

## Step 3: Test Locally

```bash
# Start the server
npm run dev

# In another terminal, test the new style
curl -X POST http://localhost:4000/generate-styled-image \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: your-secret-here" \
  -d '{
    "imageBase64": "YOUR_BASE64_IMAGE_DATA",
    "imageMimeType": "image/jpeg",
    "style": "vintage",
    "userId": "+1234567890"
  }'
```

## Step 4: Deploy

```bash
git add .
git commit -m "Add vintage film style"
git push origin main
```

## Step 5: Update Kapso Agent

1. Go to Kapso dashboard
2. Open your agent configuration
3. Copy the updated prompt from `UPDATED_AGENT_PROMPT.md`
4. Paste into the system prompt field
5. Save

## Step 6: Test via WhatsApp

1. Send a photo to your WhatsApp bot
2. Reply with "10" or "vintage"
3. Verify the image generates correctly
4. Check the caption matches

---

## Total Time: ~5 minutes ⚡️

That's it! You've successfully added a new style.

