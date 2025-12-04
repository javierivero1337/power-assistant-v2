# Style Management Guide

This guide explains how to add, edit, or remove image generation styles for the WhatsApp image styler bot.

## Quick Reference

**All styles are managed in:** `src/styles/presets.ts`

**After editing styles, you must update:**
1. ✅ The style presets in `src/styles/presets.ts`
2. ✅ The Kapso agent prompt in `docs/workflows/UPDATED_AGENT_PROMPT.md`
3. ✅ Deploy changes to Vercel

---

## Adding a New Style

### Step 1: Add to `src/styles/presets.ts`

#### 1.1 Add the style key to the `StyleKey` type (line 3-12):

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
  | 'your_new_style';  // ← Add here
```

#### 1.2 Add the style preset to `STYLE_PRESETS` (line 23-96):

```typescript
your_new_style: {
  key: 'your_new_style',
  label: 'Your New Style Name',
  prompt: 'Using the provided image, transform this portrait into... [detailed prompt for Gemini]',
  aspectRatio: '1:1',  // Options: '1:1', '3:4', '4:3', '9:16', '16:9'
  captionTemplate: '✨ Your caption with emoji!',
},
```

**Prompt Writing Tips:**
- Start with "Using the provided image, transform this portrait into..."
- Be specific about lighting, colors, textures, composition
- Reference artistic styles or technical specs (e.g., "Rembrandt lighting", "f/4 aperture")
- Keep it under 200 words for best results

#### 1.3 Add aliases to `STYLE_ALIASES` (line 98-161):

```typescript
// Your New Style
'10': 'your_new_style',
'your new style': 'your_new_style',
'nuevo estilo': 'your_new_style',
'alternative name': 'your_new_style',
```

**Alias Tips:**
- Add numeric shortcut (next number in sequence)
- Add English and Spanish variations
- Add common misspellings or abbreviations
- All aliases are automatically lowercased

---

### Step 2: Update Kapso Agent Prompt

Edit `docs/workflows/UPDATED_AGENT_PROMPT.md` (lines 12-22):

```markdown
  1. Pintura al Óleo 🎨 (artistic)
  2. Caricatura / Anime 👀 (cartoon)
  3. Foto para LinkedIn 💼 (linkedin)
  4. Versión LEGO 🧱 (lego)
  5. Cinematográfico B&W 🎬 (cinematic)
  6. Portada de Revista 📰 (magazine)
  7. Caricatura 3D 🎮 (3d)
  8. Análisis de Belleza 📊 (beauty)
  9. Sesión Profesional 📸 (professional)
  10. Your New Style ✨ (your_new_style)  ← Add here
```

And in the caption section (lines 84-93):

```markdown
   - your_new_style: "✨ Your caption with emoji!"
```

And in the aliases section (lines 101-111):

```markdown
- your_new_style → acepta: "10", "your new style", "nuevo estilo", "alternative name"
```

---

### Step 3: Deploy Changes

```bash
# Test locally first
npm run dev

# Test the endpoint
curl -X POST http://localhost:4000/generate-styled-image \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: your-secret" \
  -d '{
    "imageBase64": "...",
    "imageMimeType": "image/jpeg",
    "style": "your_new_style",
    "userId": "+1234567890"
  }'

# Deploy to Vercel
git add .
git commit -m "Add new style: your_new_style"
git push origin main
```

---

### Step 4: Update Kapso Agent Configuration

1. Go to your Kapso dashboard
2. Find your WhatsApp agent
3. Update the system prompt with the new content from `UPDATED_AGENT_PROMPT.md`
4. Test with a real WhatsApp message

---

## Editing an Existing Style

### Quick Edit Checklist:

- [ ] Update the `prompt` in `STYLE_PRESETS` (src/styles/presets.ts)
- [ ] Update `aspectRatio` if needed (1:1, 3:4, etc.)
- [ ] Update `captionTemplate` if needed
- [ ] Update `label` if changing the display name
- [ ] Update Kapso agent prompt if display name changed
- [ ] Test locally
- [ ] Deploy to Vercel
- [ ] Update Kapso agent configuration if needed

**Note:** You don't need to update aliases unless you're changing the style key itself (not recommended).

---

## Removing a Style

### Step 1: Remove from `src/styles/presets.ts`

1. Remove the key from `StyleKey` type
2. Remove the preset from `STYLE_PRESETS`
3. Remove all aliases from `STYLE_ALIASES`

### Step 2: Update Kapso Agent Prompt

1. Remove from the numbered list
2. Remove from the caption section
3. Remove from the aliases section
4. **Renumber remaining styles** (important!)

### Step 3: Deploy and Update Kapso

Same as adding a new style.

---

## Testing Checklist

After making any changes:

- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Server starts locally (`npm run dev`)
- [ ] Test with curl or Postman
- [ ] Deploy to Vercel
- [ ] Test with actual WhatsApp message
- [ ] Verify all aliases work (number, English, Spanish)
- [ ] Check credit deduction works
- [ ] Verify caption displays correctly

---

## Common Issues

### Issue: "Unknown style" error

**Cause:** Style key doesn't exist in `STYLE_PRESETS`

**Fix:** Check spelling in `StyleKey` type and `STYLE_PRESETS` object

### Issue: User input not recognized

**Cause:** Missing alias in `STYLE_ALIASES`

**Fix:** Add all variations to `STYLE_ALIASES` (lowercase, no special chars)

### Issue: Wrong aspect ratio

**Cause:** Aspect ratio doesn't match Gemini's supported formats

**Fix:** Use only: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`

### Issue: Prompt not working as expected

**Cause:** Gemini prompt needs more specificity

**Fix:** 
- Add more descriptive details
- Reference specific artistic styles or photographers
- Include technical specs (lighting, camera settings)
- Test with multiple images

---

## Advanced: Prompt Engineering Tips

### For Realistic Portraits:
```
- Specify lighting: "soft studio lighting", "golden hour", "Rembrandt lighting"
- Mention camera specs: "85mm lens, f/4, ISO 100"
- Reference photographers: "Annie Leibovitz style", "Peter Lindbergh aesthetic"
```

### For Artistic Styles:
```
- Reference artists: "Rembrandt", "Caravaggio", "Monet"
- Describe technique: "oil painting with visible brush strokes", "watercolor wash"
- Mention era: "Renaissance-era", "Impressionist", "Art Deco"
```

### For Stylized/Fun:
```
- Reference media: "Pixar animation", "comic book art", "LEGO aesthetic"
- Describe features: "large expressive eyes", "thick outlines", "blocky modular design"
- Mention mood: "playful", "vibrant", "whimsical"
```

---

## Style Performance Tracking

Consider tracking which styles are most popular:

1. Check transaction logs: `/admin/transactions`
2. Add analytics to track style usage
3. A/B test different prompts for the same style
4. Gather user feedback via WhatsApp

---

## Future Improvements (Optional)

If you grow beyond 15-20 styles, consider:

1. **Database-backed styles** - Store in Vercel KV for dynamic updates
2. **Admin UI** - Build a dashboard to edit styles without code
3. **User-custom prompts** - Let power users write their own prompts
4. **Style variations** - Allow intensity levels (subtle, medium, dramatic)
5. **Multi-language captions** - Detect user language and respond accordingly

But for now, **the current file-based approach is perfect** for your scale.

---

## Quick Command Reference

```bash
# Local development
npm run dev

# Type check
npm run build

# Deploy to Vercel
git push origin main

# Test endpoint
curl -X POST https://power-assistant-v2.vercel.app/generate-styled-image \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Webhook-Secret: your-secret" \
  -d @test-payload.json

# Check health
curl https://power-assistant-v2.vercel.app/health
```

---

## Need Help?

- Check `llms.txt` for Kapso documentation
- Review `CREDIT_SYSTEM_README.md` for credit system details
- See `docs/testing/CREDIT_SYSTEM_TESTS.md` for testing examples
- Check Gemini Imagen docs: https://ai.google.dev/gemini-api/docs/imagen

