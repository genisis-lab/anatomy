export const ORGAN_IDS = [
  "heart",
  "brain",
  "lungs",
  "liver",
  "kidneys",
  "eyeball",
  "intestine",
  "pancreas",
  "skin",
  "stomach",
  "skeleton",
  "muscles",
  "ear",
  "spinal-cord",
  "bladder",
  "thyroid",
  "lymphatic",
  "female-reproductive",
  "male-reproductive",
  "gallbladder",
  "airway-diaphragm",
] as const;

export type OrganId = (typeof ORGAN_IDS)[number];

