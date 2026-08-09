import type { Organ, OrganId } from "./anatomy-data";

export type ViewId = "explore" | "systems" | "lessons" | "library" | "notes";

export type LessonStep = {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
};

export type QuizQuestion = {
  prompt: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
};

export type LearnerState = {
  bookmarks: OrganId[];
  completedLessons: OrganId[];
  notes: Partial<Record<OrganId, string>>;
  quizScores: Partial<Record<OrganId, number>>;
  recentOrgans: OrganId[];
};

export const emptyLearnerState: LearnerState = {
  bookmarks: [],
  completedLessons: [],
  notes: {},
  quizScores: {},
  recentOrgans: [],
};

export const viewLabels: Record<ViewId, string> = {
  explore: "Explore",
  systems: "Systems",
  lessons: "Lessons",
  library: "Library",
  notes: "Notes",
};

export const anatomySources = [
  {
    label: "OpenStax Anatomy and Physiology 2e",
    href: "https://openstax.org/books/anatomy-and-physiology-2e/pages/preface",
  },
  {
    label: "MedlinePlus anatomy reference",
    href: "https://medlineplus.gov/anatomy.html",
  },
] as const;

export function lessonSteps(organ: Organ): LessonStep[] {
  return [
    {
      eyebrow: "Orientation",
      title: `Meet the ${organ.name.toLowerCase()}`,
      body: organ.description,
      points: [organ.location, organ.size, organ.weight],
    },
    {
      eyebrow: "Structure",
      title: "Find the landmarks",
      body: `Use the specimen to connect visible structure with the ${organ.name.toLowerCase()}’s role in the ${organ.system.toLowerCase()}.`,
      points: organ.hotspots.map((hotspot) => `${hotspot.label}: ${hotspot.detail}`),
    },
    {
      eyebrow: "Function",
      title: "Follow the work",
      body: `${organ.function}. ${organ.medical}`,
      points: [`Daily activity: ${organ.dailyFact}`, `Blood supply: ${organ.bloodSupply}`, `Tissue focus: ${organ.tissue}`],
    },
    {
      eyebrow: "Clinical context",
      title: "Connect structure with health",
      body: "Recognizing normal anatomy makes changes easier to understand. Use these examples as study prompts, not as diagnostic guidance.",
      points: organ.conditions.slice(0, 4),
    },
  ];
}
export function quizQuestions(organ: Organ, distractors: Organ[]): QuizQuestion[] {
  const first = distractors[0] ?? organ;
  const second = distractors[1] ?? first;
  return [
    {
      prompt: `What is the ${organ.name.toLowerCase()}’s primary role?`,
      answers: [organ.function, first.function, second.function],
      correctAnswer: 0,
      explanation: `${organ.name} primarily ${organ.function.toLowerCase()}.`,
    },
    {
      prompt: `Where is the ${organ.name.toLowerCase()} located?`,
      answers: [first.location, organ.location, second.location],
      correctAnswer: 1,
      explanation: `${organ.name} is found ${organ.location.toLowerCase()}.`,
    },
    {
      prompt: `Which tissue is associated with the ${organ.name.toLowerCase()}?`,
      answers: [second.tissue, first.tissue, organ.tissue],
      correctAnswer: 2,
      explanation: `${organ.tissue} is the featured tissue for this specimen.`,
    },
  ];
}

export function mergeLearnerState(value: unknown): LearnerState {
  if (!value || typeof value !== "object") return emptyLearnerState;
  const candidate = value as Partial<LearnerState>;
  return {
    bookmarks: Array.isArray(candidate.bookmarks) ? candidate.bookmarks : [],
    completedLessons: Array.isArray(candidate.completedLessons) ? candidate.completedLessons : [],
    notes: candidate.notes && typeof candidate.notes === "object" ? candidate.notes : {},
    quizScores: candidate.quizScores && typeof candidate.quizScores === "object" ? candidate.quizScores : {},
    recentOrgans: Array.isArray(candidate.recentOrgans) ? candidate.recentOrgans : [],
  };
}
