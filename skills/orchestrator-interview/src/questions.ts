export interface InterviewAnswers {
  language: string;
  hasImages: boolean;
  siteName?: string;
  brandName?: string;
  logo?: string;
  purpose?: string;
  tone?: string;
  presetId?: string;
  referenceUrl?: string;
}

export interface Question {
  id: keyof InterviewAnswers;
  prompt: string;
  examples: string[];
  options?: string[];
}

export const QUESTIONS: Question[] = [
  {
    id: "language",
    prompt: "What language should the site content be in?",
    examples: ["English", "Indonesian", "Japanese", "Arabic"],
  },
  {
    id: "hasImages" as keyof InterviewAnswers,
    prompt: "Do you have a design system and sample home page image?",
    examples: [],
    options: ["YES — attach 2 images (design system + page)", "NO — I'll help you design one"],
  },
  {
    id: "siteName",
    prompt: "What's the site name?",
    examples: ["TokoBuku", "CloudSync Pro", "Warung Digital"],
  },
  {
    id: "brandName",
    prompt: "Brand name (if different from site name, otherwise same)?",
    examples: ["PT Warung Nusantara", "same"],
  },
  {
    id: "logo",
    prompt: "Logo — upload a file, describe it, or skip for now?",
    examples: [
      "Upload: [attach logo.png]",
      "Describe: \"Green leaf icon with modern sans-serif text\"",
      "Skip: \"generate later\"",
    ],
  },
  {
    id: "purpose",
    prompt: "What's the site purpose?",
    examples: [
      "Food delivery landing page",
      "SaaS dashboard for inventory management",
      "Portfolio site for photographer",
    ],
  },
  {
    id: "tone",
    prompt: "Pick a tone:",
    examples: [],
    options: [
      "1. Professional & clean",
      "2. Playful & colorful",
      "3. Minimal & elegant",
      "4. Bold & energetic",
    ],
  },
];

export const TONE_MAP: Record<string, string[]> = {
  "1": ["professional", "clean"],
  "2": ["playful", "colorful"],
  "3": ["minimal", "elegant"],
  "4": ["bold", "energetic"],
  "professional": ["professional", "clean"],
  "playful": ["playful", "colorful"],
  "minimal": ["minimal", "elegant"],
  "bold": ["bold", "energetic"],
};
