export type SemesterOption = {
  key: string;
  label: string;
};

const TERM_ORDER: Record<string, number> = {
  SPRING: 1,
  SUMMER: 2,
  FALL: 3,
  WINTER: 4,
};

export const GPA_BASELINE_SEMESTERS: SemesterOption[] = [
  { key: "FALL_2024", label: "Fall 2024" },
  { key: "SPRING_2025", label: "Spring 2025" },
  { key: "SUMMER_2025", label: "Summer 2025" },
  { key: "FALL_2025", label: "Fall 2025" },
  { key: "SPRING_2026", label: "Spring 2026" },
];

type ParsedSemester = {
  term: string;
  year: number;
  order: number;
};

function parseSemester(raw: string | null | undefined): ParsedSemester | null {
  if (!raw) {
    return null;
  }

  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  const matched = normalized.match(/\b(SPRING|SUMMER|FALL|WINTER)_?([0-9]{4})\b/);
  if (!matched) {
    return null;
  }

  const term = matched[1];
  const year = Number.parseInt(matched[2], 10);
  const order = TERM_ORDER[term];
  if (!Number.isFinite(year) || !order) {
    return null;
  }

  return { term, year, order };
}

export function compareSemesterKeyDesc(a: string, b: string): number {
  const left = parseSemester(a);
  const right = parseSemester(b);

  if (left && right) {
    if (left.year !== right.year) {
      return right.year - left.year;
    }

    if (left.order !== right.order) {
      return right.order - left.order;
    }

    return b.localeCompare(a);
  }

  if (left && !right) {
    return -1;
  }

  if (!left && right) {
    return 1;
  }

  return b.localeCompare(a);
}

export function labelFromSemesterKey(key: string): string {
  const parsed = parseSemester(key);
  if (!parsed) {
    return key;
  }

  const term = parsed.term.slice(0, 1) + parsed.term.slice(1).toLowerCase();
  return `${term} ${parsed.year}`;
}
