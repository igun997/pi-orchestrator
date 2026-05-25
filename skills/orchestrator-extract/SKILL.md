---
name: orchestrator-extract
description: Extract design-system and page specs from two images, then ask gap-filling questions before site generation. Use when /orchestrator:start kicks off a run.
---

# Orchestrator Extract

Use during `extracting` and `questioning` phases of pi-orchestrators.

## When Triggered

The orchestrator extension sends you a message with two image paths after `/orchestrator:start`. Follow this workflow exactly.

## Workflow

### Phase 1: Extract specs from images

Look at both images and produce structured JSON:

**Design System** → save to `<targetDir>/.orchestrator/specs/design-system.json`:

```json
{
  "colors": {
    "primary": "oklch(...)",
    "secondary": "oklch(...)",
    "accent": "oklch(...)",
    "neutrals": ["oklch(...)"],
    "semantic": { "success": "oklch(...)", "warn": "oklch(...)", "error": "oklch(...)", "info": "oklch(...)" }
  },
  "typography": {
    "fontFamilies": { "display": "...", "body": "...", "mono": "..." },
    "scale": ["1rem", "1.25rem", ...],
    "weights": [400, 600, 700]
  },
  "spacing": { "unit": "4px", "scale": ["4px", "8px", "16px", ...] },
  "radii": ["8px", ...],
  "shadows": ["..."],
  "borders": ["..."],
  "components": [{ "name": "Button", "variants": ["primary"], "states": ["hover"] }]
}
```

Rules:
- ALL colors must be OKLCH format
- Extract what you actually see, don't invent
- Component names should match common shadcn registry names where possible

**Page Spec** → save to `<targetDir>/.orchestrator/specs/page-spec.json`:

```json
{
  "meta": { "inferredPageType": "landing" },
  "layout": { "grid": "12-column", "breakpoints": ["640px", "1024px"], "container": "max-w-7xl" },
  "sections": [
    { "id": "hero", "kind": "hero", "order": 0, "content": { "headline": "..." }, "components": ["Button"], "notes": ["centered layout"] }
  ]
}
```

Rules:
- Section `id` must be kebab-case, stable, unique
- `order` is 0-indexed top-to-bottom
- `content` captures visible text/structure
- `components` lists UI components visible in that section

### Phase 2: Ask gap-filling questions

After saving both spec files, ask these questions **one at a time** (skip if already obvious from images):

1. Product name + short tagline?
2. Target users in one sentence?
3. Tone — 3 adjectives?
4. Anti-references — sites/styles to avoid?
5. Register — brand or product?
6. Backend need — none / contact-form / auth / cms?
7. Deploy to workers.dev or custom domain?
8. (If only 1 section) Any pages beyond this one?

Wait for each answer before asking next. Cap at 8 questions.

### Phase 3: Save answers to state

After all questions answered, update `.orchestrator/state.json`:
- Set `answers` field with all Q&A (key = question id, value = answer)
- Set `phase` to `"confirming"`

### Phase 4: Show confirmation summary

Display a summary:

```
# Orchestrator confirmation

Product: <name>
Backend: <level>
Build: <N> sections
Domain: <domain>

Confirm to start seamless build + deploy.
```

### Phase 5: Wait for confirm

When user says "confirm", "yes", "go", or similar → run `/orchestrator:confirm`

This triggers the seamless pipeline. After this point, no more user prompts needed.

## Important

- Never scaffold, build, or deploy. This skill only extracts and asks.
- Save specs as valid JSON matching the schemas above.
- The `.orchestrator/` directory already exists (created by `/orchestrator:start`).
- If images are unclear, make best-effort extraction and note uncertainty in `notes` fields.
