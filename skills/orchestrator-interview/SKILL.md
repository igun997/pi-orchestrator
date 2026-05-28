---
name: orchestrator-interview
description: Conversational interview to gather site requirements. Asks language, branding, purpose, and tone — then suggests theme presets or accepts images. Use when /orchestrator:start kicks off a run.
---

# Orchestrator Interview

Use during the `interviewing` phase of pi-orchestrators. This skill replaces the mandatory 2-image requirement with a conversation-first flow.

## When Triggered

The orchestrator extension sends you a message after `/orchestrator:start`. Follow this workflow exactly.

## Workflow

### Phase 1: Ask content language

```
What language should the site content be in?
Examples: English, Indonesian, Japanese, Arabic
```

Save answer to `.orchestrator/state.json` field `answers.language`.

### Phase 2: Ask about design assets

```
Do you have a design system and sample home page image?
- YES → attach 2 images (design system + page)
- NO → I'll help you design one
```

- If **YES** → set phase to `extracting`, hand off to `orchestrator-extract` skill (existing flow)
- If **NO** → continue to Phase 3

### Phase 3: Conversational questions (no-image path)

Ask these one at a time. Always provide examples.

**Q1 — Site name:**
```
What's the site name?
Examples: "TokoBuku", "CloudSync Pro", "Warung Digital"
```

**Q2 — Brand name:**
```
Brand name (if different from site name, otherwise same)?
Examples: "PT Warung Nusantara" or just "same"
```

**Q3 — Logo:**
```
Logo — upload a file, describe it, or skip for now?
Examples:
- Upload: [attach logo.png]
- Describe: "Green leaf icon with modern sans-serif text"
- Skip: "generate later"
```

**Q4 — Purpose:**
```
What's the site purpose?
Examples:
- "Food delivery landing page"
- "SaaS dashboard for inventory management"
- "Portfolio site for photographer"
```

**Q5 — Tone:**
```
Pick a tone:
1. Professional & clean
2. Playful & colorful
3. Minimal & elegant
4. Bold & energetic
```

### Phase 4: Suggest theme presets

After all questions answered, score presets from `@orchestrator/shared` using tone + purpose keywords. Present top 2-3:

```
Based on your answers, here are theme suggestions:

A) 🔥 "Street Food Energy"
   - Primary: vibrant orange, accent: deep red
   - Font: Plus Jakarta Sans (display), Inter (body)
   - Style: bold cards, large CTAs, warm gradients

B) 🌿 "Fresh Market"
   - Primary: forest green, accent: golden yellow
   - Font: Outfit (display), DM Sans (body)
   - Style: rounded corners, food photography focus, clean grid

Pick A, B, or describe your own / provide a reference URL.
```

If user provides a reference URL, fetch it and extract color/typography cues to build a custom design system.

### Phase 5: Generate specs

After user picks a theme:

1. Save `design-system.json` to `<targetDir>/.orchestrator/specs/design-system.json` using the preset's `designSystem` field
2. Generate `page-spec.json` to `<targetDir>/.orchestrator/specs/page-spec.json` based on purpose:
   - Infer page type from purpose (landing, dashboard, docs, product)
   - Generate sections appropriate for that page type
   - Use components from the chosen preset

Example generated `page-spec.json` for "Food delivery landing page":
```json
{
  "meta": { "inferredPageType": "landing" },
  "layout": { "grid": "12-column", "breakpoints": ["640px", "1024px"], "container": "max-w-7xl" },
  "sections": [
    { "id": "hero", "kind": "hero", "order": 0, "content": { "headline": "Pesan Makanan Favoritmu", "subheadline": "Delivery cepat dari warung terdekat" }, "components": ["Button", "Badge"], "notes": ["large CTA", "food imagery background"] },
    { "id": "features", "kind": "features", "order": 1, "content": { "headline": "Kenapa Warung Digital?" }, "components": ["Card"], "notes": ["3-column grid", "icon + text cards"] },
    { "id": "menu-preview", "kind": "gallery", "order": 2, "content": { "headline": "Menu Populer" }, "components": ["Card", "Badge"], "notes": ["horizontal scroll on mobile"] },
    { "id": "testimonials", "kind": "testimonials", "order": 3, "content": { "headline": "Kata Pelanggan" }, "components": ["Card", "Avatar"], "notes": ["carousel"] },
    { "id": "cta", "kind": "cta", "order": 4, "content": { "headline": "Mulai Pesan Sekarang" }, "components": ["Button"], "notes": ["centered, bold background"] },
    { "id": "footer", "kind": "footer", "order": 5, "content": {}, "components": [], "notes": ["links, social, copyright"] }
  ]
}
```

Content must be in the user's chosen language.

### Phase 6: Continue to gap-filling

After specs saved, set phase to `questioning` and ask remaining questions:

1. Static HTML or framework (Astro + shadcn)? [default: Astro + shadcn]
2. Backend need — none / contact-form / auth / cms? [default: none]
3. Deploy to workers.dev or custom domain? [default: workers.dev]

If user says "go" or "confirm" without answering, use defaults.

### Phase 7: Save answers and confirm

Update `.orchestrator/state.json`:
- Set all `answers` fields
- Set `phase` to `"confirming"`

Display confirmation summary:

```
# Orchestrator confirmation

Site: <name>
Language: <language>
Theme: <preset name>
Backend: <level>
Build: <N> sections
Domain: <domain>

Confirm to start seamless build + deploy.
```

When user says "confirm", "yes", "go" → run `/orchestrator:confirm`

## Important

- Never scaffold, build, or deploy. This skill only interviews and generates specs.
- Ask ONE question at a time. Wait for answer before next question.
- Always provide examples with each question.
- Generated specs must match schemas in `@orchestrator/shared` exactly.
- All colors in design-system.json must be OKLCH format.
- Page content must be in the user's chosen language.
- The `.orchestrator/` directory already exists (created by `/orchestrator:start`).
