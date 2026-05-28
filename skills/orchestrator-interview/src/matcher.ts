import { PRESETS, type ThemePreset } from "@orchestrator/shared";
import { TONE_MAP } from "./questions.js";

export interface MatchInput {
  tone: string;
  purpose: string;
}

interface ScoredPreset {
  preset: ThemePreset;
  score: number;
}

/**
 * Score presets against user answers.
 * Matches tone keywords and industry keywords extracted from purpose.
 */
export function matchPresets(input: MatchInput, limit = 3): ThemePreset[] {
  const toneKeys = TONE_MAP[input.tone.toLowerCase()] ?? [input.tone.toLowerCase()];
  const purposeWords = input.purpose
    .toLowerCase()
    .split(/[\s,.\-/]+/)
    .filter((w) => w.length > 2);

  const scored: ScoredPreset[] = PRESETS.map((preset) => {
    let score = 0;

    // Score tone overlap
    for (const t of toneKeys) {
      if (preset.tones.includes(t)) score += 3;
    }

    // Score industry overlap
    for (const word of purposeWords) {
      for (const industry of preset.industries) {
        if (industry.includes(word) || word.includes(industry)) {
          score += 2;
        }
      }
    }

    return { preset, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((s) => s.score > 0)
    .map((s) => s.preset);
}

/**
 * Format preset options for display to user.
 */
export function formatPresetOptions(presets: ThemePreset[]): string {
  const labels = ["A", "B", "C", "D", "E"];
  const lines = presets.map((p, i) => {
    const label = labels[i] ?? String(i + 1);
    const primary = p.designSystem.colors.primary;
    const display = p.designSystem.typography.fontFamilies.display;
    const body = p.designSystem.typography.fontFamilies.body;
    return [
      `${label}) ${p.emoji} "${p.name}"`,
      `   - ${p.description}`,
      `   - Font: ${display} (display), ${body} (body)`,
      `   - Primary: ${primary}`,
    ].join("\n");
  });

  return [
    "Based on your answers, here are theme suggestions:\n",
    ...lines,
    "\nPick " + labels.slice(0, presets.length).join(", ") + ", or describe your own / provide a reference URL.",
  ].join("\n");
}

/**
 * Resolve user's preset choice to a ThemePreset.
 */
export function resolveChoice(choice: string, presets: ThemePreset[]): ThemePreset | undefined {
  const labels = ["a", "b", "c", "d", "e"];
  const normalized = choice.trim().toLowerCase();

  // Match by label letter
  const labelIdx = labels.indexOf(normalized);
  if (labelIdx >= 0 && labelIdx < presets.length) return presets[labelIdx];

  // Match by number
  const num = parseInt(normalized, 10);
  if (num >= 1 && num <= presets.length) return presets[num - 1];

  // Match by name
  return presets.find((p) => p.name.toLowerCase().includes(normalized));
}
