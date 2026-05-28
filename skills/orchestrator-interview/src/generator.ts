import type { DesignSystem, PageSpec } from "@orchestrator/shared";
import type { ThemePreset } from "@orchestrator/shared";
import type { InterviewAnswers } from "./questions.js";

export interface GeneratedSpecs {
  designSystem: DesignSystem;
  pageSpec: PageSpec;
}

/**
 * Infer page type from purpose string.
 */
function inferPageType(purpose: string): "landing" | "dashboard" | "docs" | "product" | "other" {
  const lower = purpose.toLowerCase();
  if (lower.includes("dashboard") || lower.includes("admin")) return "dashboard";
  if (lower.includes("docs") || lower.includes("documentation")) return "docs";
  if (lower.includes("product") || lower.includes("ecommerce") || lower.includes("shop")) return "product";
  if (lower.includes("landing") || lower.includes("homepage") || lower.includes("page")) return "landing";
  return "landing";
}

/**
 * Generate landing page sections based on purpose and language.
 */
function generateLandingSections(answers: InterviewAnswers, preset: ThemePreset): PageSpec["sections"] {
  const components = preset.designSystem.components.map((c) => c.name);
  const hasCard = components.includes("Card");
  const hasAvatar = components.includes("Avatar");
  const hasBadge = components.includes("Badge");

  return [
    {
      id: "hero",
      kind: "hero",
      order: 0,
      content: { headline: answers.siteName ?? "Welcome", subheadline: answers.purpose ?? "" },
      components: ["Button", ...(hasBadge ? ["Badge"] : [])],
      notes: ["large CTA", "full-width background"],
    },
    {
      id: "features",
      kind: "features",
      order: 1,
      content: { headline: "Features" },
      components: hasCard ? ["Card"] : ["Button"],
      notes: ["3-column grid", "icon + text cards"],
    },
    {
      id: "showcase",
      kind: "gallery",
      order: 2,
      content: { headline: "Showcase" },
      components: hasCard ? ["Card", ...(hasBadge ? ["Badge"] : [])] : ["Button"],
      notes: ["horizontal scroll on mobile", "image-heavy"],
    },
    {
      id: "testimonials",
      kind: "testimonials",
      order: 3,
      content: { headline: "Testimonials" },
      components: hasCard ? ["Card", ...(hasAvatar ? ["Avatar"] : [])] : ["Button"],
      notes: ["carousel or grid"],
    },
    {
      id: "cta",
      kind: "cta",
      order: 4,
      content: { headline: "Get Started" },
      components: ["Button"],
      notes: ["centered", "bold background color"],
    },
    {
      id: "footer",
      kind: "footer",
      order: 5,
      content: {},
      components: [],
      notes: ["links", "social icons", "copyright"],
    },
  ];
}

/**
 * Generate dashboard sections.
 */
function generateDashboardSections(answers: InterviewAnswers, preset: ThemePreset): PageSpec["sections"] {
  const components = preset.designSystem.components.map((c) => c.name);
  const hasTable = components.includes("Table");
  const hasInput = components.includes("Input");

  return [
    {
      id: "sidebar",
      kind: "navigation",
      order: 0,
      content: { headline: answers.siteName ?? "Dashboard" },
      components: ["Button"],
      notes: ["vertical nav", "collapsible"],
    },
    {
      id: "header",
      kind: "header",
      order: 1,
      content: {},
      components: hasInput ? ["Input", "Button"] : ["Button"],
      notes: ["search bar", "user avatar", "notifications"],
    },
    {
      id: "stats",
      kind: "stats",
      order: 2,
      content: { headline: "Overview" },
      components: ["Card"],
      notes: ["4-column stat cards", "icons"],
    },
    {
      id: "main-content",
      kind: "table",
      order: 3,
      content: { headline: "Data" },
      components: hasTable ? ["Table", "Button"] : ["Card", "Button"],
      notes: ["sortable", "pagination"],
    },
  ];
}

/**
 * Generate page spec sections based on inferred page type.
 */
function generateSections(answers: InterviewAnswers, preset: ThemePreset, pageType: string): PageSpec["sections"] {
  switch (pageType) {
    case "dashboard":
      return generateDashboardSections(answers, preset);
    default:
      return generateLandingSections(answers, preset);
  }
}

/**
 * Generate design-system.json and page-spec.json from interview answers + chosen preset.
 */
export function generateSpecs(answers: InterviewAnswers, preset: ThemePreset): GeneratedSpecs {
  const pageType = inferPageType(answers.purpose ?? "landing page");

  const pageSpec: PageSpec = {
    meta: { inferredPageType: pageType },
    layout: {
      grid: "12-column",
      breakpoints: ["640px", "1024px"],
      container: "max-w-7xl",
    },
    sections: generateSections(answers, preset, pageType),
  };

  return {
    designSystem: preset.designSystem,
    pageSpec,
  };
}
