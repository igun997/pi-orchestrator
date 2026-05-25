import type { PageSpec } from "@orchestrator/shared";

export type QuestionKind = "open" | "choice" | "yesno";

export interface Question {
  id: string;
  text: string;
  kind: QuestionKind;
  choices?: string[];
}

export function generateQuestions(pageSpec: PageSpec): Question[] {
  const q: Question[] = [
    { id: "product-name", text: "Product name + short tagline?", kind: "open" },
    { id: "target-users", text: "Target users in one sentence?", kind: "open" },
    { id: "tone", text: "Tone, 3 adjectives?", kind: "open" },
    { id: "anti-references", text: "Any anti-references, sites/styles to avoid?", kind: "open" },
    { id: "register", text: "Register?", kind: "choice", choices: ["brand", "product"] },
    { id: "backend-level", text: "Backend need?", kind: "choice", choices: ["none", "contact-form", "auth", "cms"] },
    { id: "domain", text: "Deploy to workers.dev or custom domain?", kind: "open" }
  ];

  if (pageSpec.sections.length <= 1) {
    q.push({ id: "extra-pages", text: "Any pages beyond delivered image, or just this page?", kind: "open" });
  }

  return q.slice(0, 8);
}
