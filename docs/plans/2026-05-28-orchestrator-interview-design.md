# Orchestrator Interview Flow Design

**Date:** 2026-05-28  
**Status:** Approved

## Summary

Replace mandatory 2-image input with conversation-first flow. Agent asks questions to determine language, branding, purpose, and visual style. Images remain optional for users who have them.

## Flow

```
/orchestrator:start [--images <ds-img> <page-img>]

→ orchestrator-interview skill (NEW)
  ├─ ask content language
  ├─ ask "have images?"
  │   ├─ YES → orchestrator-extract (existing, unchanged)
  │   └─ NO → 5 conversational questions
  │          → generate design-system.json from preset + answers
  │          → generate page-spec.json from purpose + tone
  ├─ gap-filling (framework, backend, deploy)
  └─ confirm
→ orchestrator-scaffold → build → deploy (unchanged)
```

## Conversational Questions (no-image path)

1. **Site name** — e.g. "TokoBuku", "CloudSync Pro", "Warung Digital"
2. **Brand name** — if different from site name, or "same"
3. **Logo** — upload file, describe it ("green leaf with chopsticks"), or "generate later"
4. **Purpose** — e.g. "Food delivery landing page for Indonesian market"
5. **Tone** — professional & clean / playful & colorful / minimal & elegant / bold & energetic

After answers, agent scores presets and presents 2-3 theme options. User picks one, describes their own, or provides a reference URL.

## Example Conversation

```
Agent: What language should the site content be in?
       Examples: English, Indonesian, Japanese, Arabic
User:  Indonesian

Agent: Do you have a design system and sample home page image?
       - YES → attach 2 images (design system + page)
       - NO → I'll help you design one
User:  NO

Agent: What's the site name?
       Example: "TokoBuku", "CloudSync Pro", "Warung Digital"
User:  Warung Digital

Agent: Brand name (if different from site name, otherwise same)?
       Example: "PT Warung Nusantara" or just "same"
User:  same

Agent: Logo — upload a file, describe it, or skip for now?
       Examples:
       - Upload: [attach logo.png]
       - Describe: "Green leaf icon with modern sans-serif text"
       - Skip: "generate later"
User:  Green leaf with chopsticks, modern feel

Agent: What's the site purpose?
       Examples:
       - "Food delivery landing page"
       - "SaaS dashboard for inventory management"
       - "Portfolio site for photographer"
User:  Food delivery landing page for Indonesian market

Agent: Pick a tone:
       1. Professional & clean
       2. Playful & colorful
       3. Minimal & elegant
       4. Bold & energetic
User:  4

Agent: Based on your answers, here are 2 theme suggestions:

       A) 🔥 "Street Food Energy"
          - Primary: vibrant orange, accent: deep red
          - Font: Plus Jakarta Sans (display), Inter (body)
          - Style: bold cards, large CTAs, warm gradients

       B) 🌿 "Fresh Market"
          - Primary: forest green, accent: golden yellow
          - Font: Outfit (display), DM Sans (body)
          - Style: rounded corners, food photography focus, clean grid

       Pick A, B, or describe your own / provide a reference URL.
User:  A

Agent: [generates design-system.json + page-spec.json]
       [continues to gap-filling: framework, backend, deploy]
```

## Architecture

### New skill: `skills/orchestrator-interview/`

```
skills/orchestrator-interview/
├── SKILL.md
├── package.json
├── src/
│   ├── index.ts      # main interview logic
│   ├── questions.ts  # question definitions + examples
│   ├── matcher.ts    # score presets against answers
│   └── generator.ts  # answers → design-system.json + page-spec.json
└── tsconfig.json
```

### Theme presets: `packages/shared/src/presets/`

```typescript
interface ThemePreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tones: string[];
  industries: string[];
  designSystem: {
    colors: {
      primary: string;    // oklch
      secondary: string;
      accent: string;
      neutrals: string[];
      semantic: { success: string; warn: string; error: string; info: string };
    };
    typography: {
      fontFamilies: { display: string; body: string; mono: string };
      scale: string[];
      weights: number[];
    };
    spacing: { unit: string; scale: string[] };
    radii: string[];
    shadows: string[];
  };
}
```

~10-15 presets covering common tone + industry combos. Agent scores `tones` + `industries` overlap against user answers, presents top 2-3.

### State transitions

- `interviewing` → `extracting` (image path) OR `generating` (no-image path)
- `generating` → `questioning` (gap-fill)
- `questioning` → `confirming`

### Unchanged

- `orchestrator-extract` — used when user provides images
- `orchestrator-scaffold`, `orchestrator-build`, `orchestrator-deploy` — no changes
- `design-system.json` and `page-spec.json` schemas — same output regardless of path

## Key Decisions

- Images optional, not removed — backward compatible
- `/orchestrator:start` args become optional
- Presets are typed objects in shared package (reusable, testable)
- Generated specs use identical schema as vision extraction output
- Agent picks presets via scoring, not hardcoded mapping
