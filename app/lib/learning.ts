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

export type QuizAttempt = {
  mode: "knowledge" | "labelling";
  score: number;
  total: number;
  completedAt: number;
};

export type StructureProgress = {
  correct: number;
  attempts: number;
  lastReviewed: number;
};

export type LearnerState = {
  bookmarks: OrganId[];
  completedLessons: OrganId[];
  notes: Partial<Record<OrganId, string>>;
  structureNotes: Partial<Record<OrganId, Record<string, string>>>;
  structureBookmarks: Partial<Record<OrganId, string[]>>;
  quizScores: Partial<Record<OrganId, number>>;
  quizAttempts: Partial<Record<OrganId, QuizAttempt[]>>;
  structureProgress: Partial<Record<OrganId, Record<string, StructureProgress>>>;
  lessonProgress: Partial<Record<OrganId, number>>;
  lastStudiedAt: Partial<Record<OrganId, number>>;
  recentOrgans: OrganId[];
};

export const emptyLearnerState: LearnerState = {
  bookmarks: [],
  completedLessons: [],
  notes: {},
  structureNotes: {},
  structureBookmarks: {},
  quizScores: {},
  quizAttempts: {},
  structureProgress: {},
  lessonProgress: {},
  lastStudiedAt: {},
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
    structureNotes: candidate.structureNotes && typeof candidate.structureNotes === "object" ? candidate.structureNotes : {},
    structureBookmarks: candidate.structureBookmarks && typeof candidate.structureBookmarks === "object" ? candidate.structureBookmarks : {},
    quizScores: candidate.quizScores && typeof candidate.quizScores === "object" ? candidate.quizScores : {},
    quizAttempts: candidate.quizAttempts && typeof candidate.quizAttempts === "object" ? candidate.quizAttempts : {},
    structureProgress: candidate.structureProgress && typeof candidate.structureProgress === "object" ? candidate.structureProgress : {},
    lessonProgress: candidate.lessonProgress && typeof candidate.lessonProgress === "object" ? candidate.lessonProgress : {},
    lastStudiedAt: candidate.lastStudiedAt && typeof candidate.lastStudiedAt === "object" ? candidate.lastStudiedAt : {},
    recentOrgans: Array.isArray(candidate.recentOrgans) ? candidate.recentOrgans : [],
  };
}

export type ReviewTarget = {
  organId: OrganId;
  hotspotId?: string;
  accuracy: number;
  lastReviewed: number;
};

export function buildReviewQueue(organs: Organ[], learner: LearnerState): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  organs.forEach((organ) => {
    const structure = learner.structureProgress[organ.id] ?? {};
    organ.hotspots.forEach((hotspot) => {
      const progress = structure[hotspot.id];
      if (!progress || progress.attempts === 0 || progress.correct === progress.attempts) return;
      targets.push({
        organId: organ.id,
        hotspotId: hotspot.id,
        accuracy: progress.correct / progress.attempts,
        lastReviewed: progress.lastReviewed,
      });
    });
    const attempts = learner.quizAttempts[organ.id] ?? [];
    const latest = attempts.at(-1);
    if (latest && latest.score < latest.total) {
      targets.push({
        organId: organ.id,
        accuracy: latest.total ? latest.score / latest.total : 0,
        lastReviewed: latest.completedAt,
      });
    }
  });
  return targets
    .sort((a, b) => a.accuracy - b.accuracy || a.lastReviewed - b.lastReviewed)
    .slice(0, 8);
}

const pathwaySequences: Partial<Record<OrganId, OrganId[]>> = {
  heart: ["heart", "lungs", "brain", "kidneys"],
  lungs: ["airway-diaphragm", "lungs", "heart"],
  stomach: ["esophagus", "stomach", "intestine", "liver", "gallbladder", "pancreas"],
  liver: ["esophagus", "stomach", "intestine", "liver", "gallbladder", "pancreas"],
  kidneys: ["kidneys", "bladder"],
  brain: ["brain", "spinal-cord", "muscles"],
  pancreas: ["pancreas", "liver", "thyroid"],
  skeleton: ["skeleton", "knee", "muscles", "spinal-cord"],
  muscles: ["brain", "spinal-cord", "muscles", "skeleton"],
  "female-reproductive": ["female-reproductive", "male-reproductive"],
  "male-reproductive": ["male-reproductive", "female-reproductive"],
  lymphatic: ["lymphatic", "spleen", "skin", "intestine"],
  eyeball: ["eyeball", "brain"],
  ear: ["ear", "brain"],
};

export function systemPathway(system: string, organs: Organ[]): Organ[] {
  const group = organs.filter((organ) => organ.system === system);
  const sequence = pathwaySequences[group[0]?.id];
  if (!sequence) return group;
  const byId = new Map(organs.map((organ) => [organ.id, organ]));
  return sequence.flatMap((id) => byId.get(id) ?? []);
}
