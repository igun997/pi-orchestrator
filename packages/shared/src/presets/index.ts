import type { DesignSystem } from "../schemas.js";

export interface ThemePreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tones: string[];
  industries: string[];
  designSystem: DesignSystem;
}

export const PRESETS: ThemePreset[] = [
  {
    id: "street-food-energy",
    name: "Street Food Energy",
    emoji: "🔥",
    description: "Bold cards, large CTAs, warm gradients",
    tones: ["bold", "energetic"],
    industries: ["food", "delivery", "restaurant", "street-food"],
    designSystem: {
      colors: {
        primary: "oklch(0.65 0.25 30)",
        secondary: "oklch(0.45 0.2 15)",
        accent: "oklch(0.75 0.18 60)",
        neutrals: ["oklch(0.98 0 0)", "oklch(0.9 0 0)", "oklch(0.7 0 0)", "oklch(0.3 0 0)", "oklch(0.15 0 0)"],
        semantic: { success: "oklch(0.7 0.2 145)", warn: "oklch(0.75 0.18 85)", error: "oklch(0.55 0.25 25)", info: "oklch(0.65 0.15 250)" }
      },
      typography: {
        fontFamilies: { display: "Plus Jakarta Sans", body: "Inter", mono: "JetBrains Mono" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3rem"],
        weights: [400, 600, 700, 800]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["8px", "12px", "16px", "9999px"],
      shadows: ["0 2px 8px oklch(0 0 0 / 0.08)", "0 8px 24px oklch(0 0 0 / 0.12)"],
      borders: ["1px solid oklch(0.9 0 0)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "ghost"], states: ["hover", "active", "disabled"] },
        { name: "Card", variants: ["default", "elevated"], states: ["hover"] },
        { name: "Badge", variants: ["default", "outline"], states: [] }
      ]
    }
  },
  {
    id: "fresh-market",
    name: "Fresh Market",
    emoji: "🌿",
    description: "Rounded corners, food photography focus, clean grid",
    tones: ["bold", "playful"],
    industries: ["food", "organic", "grocery", "health"],
    designSystem: {
      colors: {
        primary: "oklch(0.55 0.18 145)",
        secondary: "oklch(0.7 0.15 90)",
        accent: "oklch(0.75 0.2 85)",
        neutrals: ["oklch(0.99 0.01 110)", "oklch(0.95 0.01 110)", "oklch(0.7 0 0)", "oklch(0.35 0 0)", "oklch(0.15 0 0)"],
        semantic: { success: "oklch(0.7 0.2 145)", warn: "oklch(0.75 0.18 85)", error: "oklch(0.55 0.25 25)", info: "oklch(0.65 0.15 250)" }
      },
      typography: {
        fontFamilies: { display: "Outfit", body: "DM Sans", mono: "Fira Code" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3rem"],
        weights: [400, 500, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["12px", "16px", "24px", "9999px"],
      shadows: ["0 1px 4px oklch(0 0 0 / 0.05)", "0 4px 16px oklch(0 0 0 / 0.08)"],
      borders: ["1px solid oklch(0.92 0.01 110)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "outline"], states: ["hover", "active"] },
        { name: "Card", variants: ["default", "image"], states: ["hover"] },
        { name: "Avatar", variants: ["circle", "rounded"], states: [] }
      ]
    }
  },
  {
    id: "corporate-trust",
    name: "Corporate Trust",
    emoji: "🏢",
    description: "Clean lines, navy palette, authoritative typography",
    tones: ["professional", "clean"],
    industries: ["fintech", "saas", "enterprise", "consulting", "legal"],
    designSystem: {
      colors: {
        primary: "oklch(0.4 0.12 250)",
        secondary: "oklch(0.55 0.1 250)",
        accent: "oklch(0.65 0.18 200)",
        neutrals: ["oklch(0.99 0 0)", "oklch(0.95 0 0)", "oklch(0.85 0 0)", "oklch(0.4 0 0)", "oklch(0.15 0 0)"],
        semantic: { success: "oklch(0.65 0.18 155)", warn: "oklch(0.7 0.15 80)", error: "oklch(0.55 0.2 20)", info: "oklch(0.6 0.15 250)" }
      },
      typography: {
        fontFamilies: { display: "Geist", body: "Inter", mono: "Geist Mono" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.125rem", "1.25rem", "1.5rem", "2rem", "2.5rem"],
        weights: [400, 500, 600, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px", "96px"] },
      radii: ["4px", "8px", "12px"],
      shadows: ["0 1px 3px oklch(0 0 0 / 0.06)", "0 4px 12px oklch(0 0 0 / 0.08)"],
      borders: ["1px solid oklch(0.9 0 0)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "ghost", "link"], states: ["hover", "active", "disabled"] },
        { name: "Card", variants: ["default", "bordered"], states: [] },
        { name: "Table", variants: ["default", "striped"], states: [] },
        { name: "Input", variants: ["default", "error"], states: ["focus", "disabled"] }
      ]
    }
  },
  {
    id: "candy-pop",
    name: "Candy Pop",
    emoji: "🍬",
    description: "Vibrant gradients, rounded everything, fun animations",
    tones: ["playful", "colorful"],
    industries: ["kids", "gaming", "social", "creative", "education"],
    designSystem: {
      colors: {
        primary: "oklch(0.7 0.25 310)",
        secondary: "oklch(0.7 0.2 260)",
        accent: "oklch(0.8 0.2 150)",
        neutrals: ["oklch(0.99 0.01 300)", "oklch(0.95 0.02 300)", "oklch(0.75 0 0)", "oklch(0.35 0 0)", "oklch(0.12 0 0)"],
        semantic: { success: "oklch(0.75 0.2 150)", warn: "oklch(0.8 0.18 90)", error: "oklch(0.6 0.25 15)", info: "oklch(0.7 0.18 250)" }
      },
      typography: {
        fontFamilies: { display: "Fredoka", body: "Nunito", mono: "Fira Code" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "3rem", "4rem"],
        weights: [400, 500, 600, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["16px", "24px", "32px", "9999px"],
      shadows: ["0 4px 12px oklch(0.7 0.15 310 / 0.2)", "0 8px 32px oklch(0.7 0.15 310 / 0.15)"],
      borders: ["2px solid oklch(0.9 0.05 300)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "pill"], states: ["hover", "active"] },
        { name: "Card", variants: ["default", "gradient"], states: ["hover"] },
        { name: "Badge", variants: ["default", "pill"], states: [] }
      ]
    }
  },
  {
    id: "zen-minimal",
    name: "Zen Minimal",
    emoji: "🪷",
    description: "Whitespace-heavy, subtle accents, elegant restraint",
    tones: ["minimal", "elegant"],
    industries: ["portfolio", "photography", "luxury", "fashion", "architecture"],
    designSystem: {
      colors: {
        primary: "oklch(0.25 0 0)",
        secondary: "oklch(0.5 0 0)",
        accent: "oklch(0.6 0.08 60)",
        neutrals: ["oklch(1 0 0)", "oklch(0.97 0 0)", "oklch(0.92 0 0)", "oklch(0.6 0 0)", "oklch(0.15 0 0)"],
        semantic: { success: "oklch(0.6 0.12 155)", warn: "oklch(0.65 0.1 80)", error: "oklch(0.5 0.15 20)", info: "oklch(0.55 0.1 250)" }
      },
      typography: {
        fontFamilies: { display: "Cormorant Garamond", body: "Source Sans 3", mono: "IBM Plex Mono" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "3rem", "4rem"],
        weights: [300, 400, 600]
      },
      spacing: { unit: "8px", scale: ["8px", "16px", "24px", "32px", "48px", "64px", "96px", "128px"] },
      radii: ["0px", "2px", "4px"],
      shadows: ["0 1px 2px oklch(0 0 0 / 0.03)"],
      borders: ["1px solid oklch(0.92 0 0)"],
      components: [
        { name: "Button", variants: ["primary", "ghost", "link"], states: ["hover"] },
        { name: "Card", variants: ["default", "borderless"], states: [] },
        { name: "Separator", variants: ["default"], states: [] }
      ]
    }
  },
  {
    id: "neon-tech",
    name: "Neon Tech",
    emoji: "⚡",
    description: "Dark mode, neon accents, futuristic feel",
    tones: ["bold", "energetic"],
    industries: ["tech", "startup", "crypto", "ai", "developer-tools"],
    designSystem: {
      colors: {
        primary: "oklch(0.75 0.25 180)",
        secondary: "oklch(0.7 0.2 280)",
        accent: "oklch(0.8 0.22 130)",
        neutrals: ["oklch(0.15 0.01 260)", "oklch(0.2 0.01 260)", "oklch(0.3 0.01 260)", "oklch(0.6 0 0)", "oklch(0.9 0 0)"],
        semantic: { success: "oklch(0.75 0.2 150)", warn: "oklch(0.8 0.18 85)", error: "oklch(0.65 0.25 15)", info: "oklch(0.7 0.2 250)" }
      },
      typography: {
        fontFamilies: { display: "Space Grotesk", body: "Inter", mono: "JetBrains Mono" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.125rem", "1.25rem", "1.5rem", "2rem", "3rem"],
        weights: [400, 500, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["6px", "8px", "12px", "9999px"],
      shadows: ["0 0 12px oklch(0.75 0.25 180 / 0.3)", "0 0 32px oklch(0.7 0.2 280 / 0.2)"],
      borders: ["1px solid oklch(0.3 0.05 260)"],
      components: [
        { name: "Button", variants: ["primary", "outline", "ghost"], states: ["hover", "active", "glow"] },
        { name: "Card", variants: ["default", "glass"], states: ["hover"] },
        { name: "Input", variants: ["default", "glow"], states: ["focus"] }
      ]
    }
  },
  {
    id: "warm-craft",
    name: "Warm Craft",
    emoji: "🪵",
    description: "Earthy tones, handcrafted feel, cozy warmth",
    tones: ["professional", "clean"],
    industries: ["cafe", "bakery", "handmade", "artisan", "local-business"],
    designSystem: {
      colors: {
        primary: "oklch(0.5 0.1 50)",
        secondary: "oklch(0.6 0.08 70)",
        accent: "oklch(0.65 0.15 30)",
        neutrals: ["oklch(0.98 0.01 70)", "oklch(0.94 0.02 70)", "oklch(0.8 0.02 60)", "oklch(0.4 0.02 50)", "oklch(0.2 0.01 50)"],
        semantic: { success: "oklch(0.6 0.15 145)", warn: "oklch(0.7 0.15 80)", error: "oklch(0.55 0.18 20)", info: "oklch(0.6 0.1 240)" }
      },
      typography: {
        fontFamilies: { display: "Playfair Display", body: "Lora", mono: "Courier Prime" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3.5rem"],
        weights: [400, 500, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["4px", "8px", "12px"],
      shadows: ["0 2px 6px oklch(0.5 0.05 50 / 0.1)", "0 6px 20px oklch(0.5 0.05 50 / 0.12)"],
      borders: ["1px solid oklch(0.88 0.03 70)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "outline"], states: ["hover", "active"] },
        { name: "Card", variants: ["default", "textured"], states: ["hover"] },
        { name: "Badge", variants: ["default"], states: [] }
      ]
    }
  },
  {
    id: "ocean-breeze",
    name: "Ocean Breeze",
    emoji: "🌊",
    description: "Cool blues, flowing layouts, calm and trustworthy",
    tones: ["professional", "clean", "minimal"],
    industries: ["travel", "wellness", "spa", "marine", "real-estate"],
    designSystem: {
      colors: {
        primary: "oklch(0.55 0.15 230)",
        secondary: "oklch(0.65 0.12 200)",
        accent: "oklch(0.7 0.15 180)",
        neutrals: ["oklch(0.99 0.01 220)", "oklch(0.96 0.01 220)", "oklch(0.8 0 0)", "oklch(0.4 0 0)", "oklch(0.15 0 0)"],
        semantic: { success: "oklch(0.65 0.18 155)", warn: "oklch(0.72 0.15 80)", error: "oklch(0.55 0.2 15)", info: "oklch(0.6 0.15 240)" }
      },
      typography: {
        fontFamilies: { display: "Sora", body: "Nunito Sans", mono: "Fira Code" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3rem"],
        weights: [300, 400, 600, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px", "96px"] },
      radii: ["8px", "12px", "16px", "9999px"],
      shadows: ["0 2px 8px oklch(0.55 0.1 230 / 0.1)", "0 8px 24px oklch(0.55 0.1 230 / 0.08)"],
      borders: ["1px solid oklch(0.92 0.02 220)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "ghost"], states: ["hover", "active"] },
        { name: "Card", variants: ["default", "glass"], states: ["hover"] },
        { name: "Tabs", variants: ["default", "pill"], states: ["active"] }
      ]
    }
  },
  {
    id: "startup-velocity",
    name: "Startup Velocity",
    emoji: "🚀",
    description: "Modern gradients, punchy CTAs, conversion-focused",
    tones: ["bold", "energetic", "playful"],
    industries: ["saas", "startup", "product", "app", "marketplace"],
    designSystem: {
      colors: {
        primary: "oklch(0.6 0.22 280)",
        secondary: "oklch(0.55 0.18 250)",
        accent: "oklch(0.75 0.2 330)",
        neutrals: ["oklch(0.99 0 0)", "oklch(0.96 0 0)", "oklch(0.85 0 0)", "oklch(0.4 0 0)", "oklch(0.12 0 0)"],
        semantic: { success: "oklch(0.7 0.2 150)", warn: "oklch(0.75 0.18 85)", error: "oklch(0.6 0.22 20)", info: "oklch(0.65 0.18 250)" }
      },
      typography: {
        fontFamilies: { display: "Cal Sans", body: "Inter", mono: "Geist Mono" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3.5rem"],
        weights: [400, 500, 600, 700, 800]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["8px", "12px", "16px", "9999px"],
      shadows: ["0 2px 8px oklch(0.6 0.15 280 / 0.15)", "0 12px 40px oklch(0.6 0.15 280 / 0.1)"],
      borders: ["1px solid oklch(0.92 0 0)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "gradient", "ghost"], states: ["hover", "active"] },
        { name: "Card", variants: ["default", "elevated", "gradient-border"], states: ["hover"] },
        { name: "Badge", variants: ["default", "gradient"], states: [] },
        { name: "Input", variants: ["default"], states: ["focus", "error"] }
      ]
    }
  },
  {
    id: "islamic-elegance",
    name: "Islamic Elegance",
    emoji: "🕌",
    description: "Rich golds, deep greens, geometric patterns, respectful luxury",
    tones: ["professional", "elegant"],
    industries: ["islamic", "halal", "mosque", "charity", "education"],
    designSystem: {
      colors: {
        primary: "oklch(0.5 0.15 155)",
        secondary: "oklch(0.7 0.15 85)",
        accent: "oklch(0.65 0.12 70)",
        neutrals: ["oklch(0.99 0.01 85)", "oklch(0.95 0.02 85)", "oklch(0.8 0 0)", "oklch(0.35 0 0)", "oklch(0.12 0 0)"],
        semantic: { success: "oklch(0.6 0.15 155)", warn: "oklch(0.7 0.15 80)", error: "oklch(0.55 0.18 20)", info: "oklch(0.6 0.12 240)" }
      },
      typography: {
        fontFamilies: { display: "Amiri", body: "Noto Sans", mono: "Fira Code" },
        scale: ["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem", "3rem"],
        weights: [400, 600, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
      radii: ["4px", "8px", "12px", "9999px"],
      shadows: ["0 2px 8px oklch(0.5 0.08 85 / 0.1)", "0 8px 24px oklch(0.5 0.08 85 / 0.08)"],
      borders: ["1px solid oklch(0.9 0.03 85)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "outline"], states: ["hover", "active"] },
        { name: "Card", variants: ["default", "ornate"], states: ["hover"] },
        { name: "Separator", variants: ["default", "ornate"], states: [] }
      ]
    }
  }
];
