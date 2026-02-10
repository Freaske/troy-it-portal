import { compareSemesterKeyDesc } from "@/lib/semester";

export type GradeSpec = {
  letter: string;
  point: number | null;
  includeInGpa: boolean;
  labelVi: string;
  labelEn: string;
  labelJa: string;
};

export const GRADE_SPECS: GradeSpec[] = [
  { letter: "A", point: 4, includeInGpa: true, labelVi: "Xuất sắc", labelEn: "Excellent", labelJa: "秀" },
  { letter: "B", point: 3, includeInGpa: true, labelVi: "Tốt", labelEn: "Good", labelJa: "良" },
  { letter: "C", point: 2, includeInGpa: true, labelVi: "Trung bình", labelEn: "Average", labelJa: "可" },
  { letter: "D", point: 1, includeInGpa: true, labelVi: "Đạt", labelEn: "Pass", labelJa: "可下" },
  { letter: "F", point: 0, includeInGpa: true, labelVi: "Trượt", labelEn: "Fail", labelJa: "不可" },
];

const GRADE_SPEC_MAP = new Map(GRADE_SPECS.map((item) => [item.letter, item]));
const GRADE_ALIAS_MAP = new Map<string, string>([
  ["A+", "A"],
  ["A-", "A"],
  ["B+", "B"],
  ["B-", "B"],
  ["C+", "C"],
  ["C-", "C"],
  ["D+", "D"],
  ["D-", "D"],
  ["E", "F"],
]);

export type GpaEntryLike = {
  semesterKey: string;
  credits: number;
  gradePoint: number | null;
  includeInGpa: boolean;
};

export type SemesterGpaSummary = {
  semesterKey: string;
  gpa: number | null;
  totalCourses: number;
  totalCredits: number;
  countedCredits: number;
  qualityPoints: number;
};

export type OverallGpaSummary = {
  gpa: number | null;
  totalCourses: number;
  totalCredits: number;
  countedCredits: number;
  qualityPoints: number;
};

export type GpaSummary = {
  overall: OverallGpaSummary;
  bySemester: SemesterGpaSummary[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeSemesterKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");

  return cleaned || null;
}

export function normalizeGradeLetter(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!cleaned) {
    return null;
  }

  const canonical = GRADE_ALIAS_MAP.get(cleaned) ?? cleaned;
  return GRADE_SPEC_MAP.has(canonical) ? canonical : null;
}

export function gradeSpecByLetter(letter: string | null | undefined): GradeSpec | null {
  const normalized = normalizeGradeLetter(letter);
  if (!normalized) {
    return null;
  }

  return GRADE_SPEC_MAP.get(normalized) ?? null;
}

export function calculateGpaSummary(entries: GpaEntryLike[]): GpaSummary {
  const semesterMap = new Map<
    string,
    {
      semesterKey: string;
      totalCourses: number;
      totalCredits: number;
      countedCredits: number;
      qualityPoints: number;
    }
  >();

  let totalCourses = 0;
  let totalCredits = 0;
  let countedCredits = 0;
  let qualityPoints = 0;

  for (const entry of entries) {
    const semesterKey = entry.semesterKey;
    const row = semesterMap.get(semesterKey) ?? {
      semesterKey,
      totalCourses: 0,
      totalCredits: 0,
      countedCredits: 0,
      qualityPoints: 0,
    };

    row.totalCourses += 1;
    row.totalCredits += entry.credits;

    totalCourses += 1;
    totalCredits += entry.credits;

    if (entry.includeInGpa && entry.gradePoint !== null) {
      const qp = entry.gradePoint * entry.credits;
      row.countedCredits += entry.credits;
      row.qualityPoints += qp;
      countedCredits += entry.credits;
      qualityPoints += qp;
    }

    semesterMap.set(semesterKey, row);
  }

  const bySemester = [...semesterMap.values()]
    .map((row) => ({
      semesterKey: row.semesterKey,
      gpa: row.countedCredits > 0 ? round2(row.qualityPoints / row.countedCredits) : null,
      totalCourses: row.totalCourses,
      totalCredits: row.totalCredits,
      countedCredits: row.countedCredits,
      qualityPoints: round2(row.qualityPoints),
    }))
    .sort((a, b) => compareSemesterKeyDesc(a.semesterKey, b.semesterKey));

  return {
    overall: {
      gpa: countedCredits > 0 ? round2(qualityPoints / countedCredits) : null,
      totalCourses,
      totalCredits,
      countedCredits,
      qualityPoints: round2(qualityPoints),
    },
    bySemester,
  };
}
