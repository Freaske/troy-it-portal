import fs from "node:fs";
import path from "node:path";

const DEFAULT_CATALOG_PATH = path.resolve(process.cwd(), "data/catalog/Catalog.csv");
const DEFAULT_RESOURCES_DIR = path.resolve(process.cwd(), "data/resources");
const CACHE_TTL_MS = 60_000;

type Sentiment = "positive" | "neutral" | "negative";

type CatalogCourse = {
  code: string;
  nameEn: string | null;
  nameVi: string | null;
  credits: number | null;
  prerequisite: string | null;
  note: string | null;
  program: string | null;
  section: string | null;
};

type ResourceFile = {
  name: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
};

type RawCourseData = {
  code: string;
  resources: ResourceFile[];
  guidePath: string | null;
  guideContent: string | null;
};

type LecturerSeed = {
  id: string;
  name: string;
  profileUrl: string | null;
  courseCodes: Set<string>;
};

export type LecturerReview = {
  id: string;
  courseCode: string;
  lecturerId: string | null;
  lecturerName: string | null;
  content: string;
  rating: number | null;
  sentiment: Sentiment;
  sourceFile: string;
};

export type LecturerOverview = {
  id: string;
  name: string;
  profileUrl: string | null;
  courses: string[];
  reviewCount: number;
  averageRating: number | null;
};

export type CourseOverview = {
  code: string;
  nameEn: string | null;
  nameVi: string | null;
  credits: number | null;
  prerequisite: string | null;
  note: string | null;
  program: string | null;
  section: string | null;
  resources: ResourceFile[];
  lecturers: LecturerOverview[];
  reviews: LecturerReview[];
  averageRating: number | null;
};

export type KnowledgeBundle = {
  sourcePaths: {
    catalogCsvPath: string;
    resourcesDir: string;
  };
  generatedAt: string;
  stats: {
    courses: number;
    lecturers: number;
    reviews: number;
    resources: number;
  };
  courses: CourseOverview[];
  lecturers: LecturerOverview[];
};

let cache: { at: number; data: KnowledgeBundle } | null = null;

function cleanCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeSearchText(value: string): string {
  return normalizeText(value);
}

export function normalizeCourseCode(raw: string): string | null {
  const text = cleanCell(raw).toUpperCase().replace(/\s+/g, " ");
  if (!text) {
    return null;
  }

  const compact = text.replace(/\s+/g, "");
  const matched = compact.match(/^([A-Z]{2,6})(\d{3,4}[A-Z]?)$/);
  if (!matched) {
    return null;
  }

  return `${matched[1]} ${matched[2]}`;
}

function slugify(input: string): string {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function scoreFromContent(content: string): number | null {
  const text = normalizeText(content);
  const positiveWords = [
    "gioi",
    "tot",
    "tan tuy",
    "ton trong",
    "than thien",
    "gan gui",
    "thu vi",
    "chuan chi",
    "dong cam",
    "good",
    "great",
    "excellent",
    "a good man",
    "safe",
    "an toan",
    "A la co",
  ];

  const negativeWords = [
    "chan",
    "kho",
    "cang thang",
    "do sat",
    "diem thap",
    "thai do",
    "kho chiu",
    "khon nan",
    "tom",
    "thap",
    "nghiet",
    "stress",
    "bad",
    "hard",
    "toxic",
  ];

  let positiveHits = 0;
  for (const word of positiveWords) {
    if (text.includes(normalizeText(word))) {
      positiveHits += 1;
    }
  }

  let negativeHits = 0;
  for (const word of negativeWords) {
    if (text.includes(normalizeText(word))) {
      negativeHits += 1;
    }
  }

  if (positiveHits === 0 && negativeHits === 0) {
    return null;
  }

  const score = Math.max(1, Math.min(5, 3 + positiveHits - negativeHits));
  return score;
}

function sentimentFromScore(score: number | null): Sentiment {
  if (score === null) {
    return "neutral";
  }
  if (score >= 4) {
    return "positive";
  }
  if (score <= 2) {
    return "negative";
  }
  return "neutral";
}

function parseCsvText(content: string): string[][] {
  const rows: string[][] = [];
  const row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inQuotes) {
      if (char === "\"") {
        if (content[i + 1] === "\"") {
          field += "\"";
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }

      field += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push([...row]);
      row.length = 0;
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push([...row]);
  }

  return rows;
}

function decodeCatalogCsv(buffer: Buffer): string {
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Basic mojibake recovery for strings like "Khoa Há»c MÃ¡y TÃ­nh".
  const mojibakeMarkers = ["Ã", "á»", "â€", "Ä", "�"];
  const markerHits = mojibakeMarkers.reduce(
    (sum, marker) => sum + (text.match(new RegExp(marker, "g"))?.length ?? 0),
    0,
  );
  if (markerHits >= 8) {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (repaired.includes("Khoa Học") || repaired.includes("Tiếng Việt")) {
      return repaired;
    }
  }

  return text;
}

function parseCatalog(catalogCsvPath: string): Map<string, CatalogCourse> {
  const catalog = new Map<string, CatalogCourse>();
  if (!fs.existsSync(catalogCsvPath)) {
    return catalog;
  }

  const raw = fs.readFileSync(catalogCsvPath);
  const csvText = decodeCatalogCsv(raw);
  const rows = parseCsvText(csvText);

  let currentProgram: string | null = null;
  let currentSection: string | null = null;

  for (const row of rows) {
    const cells = row.map((cell) => cleanCell(cell));
    const nonEmpty = cells.filter(Boolean);

    if (nonEmpty.length === 0) {
      continue;
    }

    const code = normalizeCourseCode(cells[1] ?? "");
    if (code) {
      const creditsRaw = Number.parseInt(cleanCell(cells[4]), 10);
      catalog.set(code, {
        code,
        nameEn: cleanCell(cells[2]) || null,
        nameVi: cleanCell(cells[3]) || null,
        credits: Number.isFinite(creditsRaw) ? creditsRaw : null,
        prerequisite: cleanCell(cells[5]) || null,
        note: cleanCell(cells[6]) || null,
        program: currentProgram,
        section: currentSection,
      });
      continue;
    }

    const first = cleanCell(cells[0]);
    const second = cleanCell(cells[1]);
    const normalized = normalizeText(`${first} ${second}`);

    if (normalized.includes("program")) {
      currentProgram = first || second || null;
      currentSection = null;
      continue;
    }

    if (normalized.includes("required courses") || normalized.includes("major electives") || normalized.includes("free electives") || normalized.includes("hust political theory")) {
      currentSection = first || second || null;
      continue;
    }

    if (normalizeText(first) === "no." || normalizeText(second) === "ma hp") {
      continue;
    }

    if (!first && second && nonEmpty.length <= 2) {
      currentSection = second;
    }
  }

  return catalog;
}

function scanCourseResources(resourcesDir: string): Map<string, RawCourseData> {
  const result = new Map<string, RawCourseData>();
  if (!fs.existsSync(resourcesDir)) {
    return result;
  }

  const topLevel = fs.readdirSync(resourcesDir, { withFileTypes: true });

  for (const entry of topLevel) {
    if (!entry.isDirectory()) {
      continue;
    }

    const courseCode = normalizeCourseCode(entry.name);
    if (!courseCode) {
      continue;
    }

    const courseDir = path.join(resourcesDir, entry.name);
    const resources: ResourceFile[] = [];
    let guidePath: string | null = null;
    let guideContent: string | null = null;

    const stack = [courseDir];
    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) {
        continue;
      }

      for (const node of fs.readdirSync(currentDir, { withFileTypes: true })) {
        if (node.name.startsWith(".")) {
          continue;
        }

        const absPath = path.join(currentDir, node.name);
        if (node.isDirectory()) {
          stack.push(absPath);
          continue;
        }

        const relativePath = path.relative(courseDir, absPath);
        const extension = path.extname(node.name).replace(/^\./, "").toLowerCase() || "unknown";

        if (node.name.toLowerCase() === "guide.md") {
          guidePath = absPath;
          guideContent = fs.readFileSync(absPath, "utf-8");
        }

        const stat = fs.statSync(absPath);
        resources.push({
          name: node.name,
          relativePath,
          absolutePath: absPath,
          extension,
          sizeBytes: stat.size,
        });
      }
    }

    resources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    result.set(courseCode, {
      code: courseCode,
      resources,
      guidePath,
      guideContent,
    });
  }

  return result;
}

function cleanLecturerName(raw: string): string {
  return raw
    .replace(/^\s*\d+\.\s*/g, "")
    .replace(/^(Professor|Prof\.?|Thầy|Cô|Mr\.?|Ms\.?)\s+/i, "")
    .replace(/^[-*\s]+/g, "")
    .trim();
}

function parseGuide(
  courseCode: string,
  guidePath: string,
  guideContent: string,
  lecturersById: Map<string, LecturerSeed>,
  reviews: LecturerReview[],
): void {
  const referenceLinks = new Map<string, string>();
  const referencePattern = /^\[([^\]]+)\]:\s*(https?:\/\/\S+)/gim;
  let referenceMatch = referencePattern.exec(guideContent);
  while (referenceMatch) {
    referenceLinks.set(referenceMatch[1].trim().toLowerCase(), referenceMatch[2].trim());
    referenceMatch = referencePattern.exec(guideContent);
  }

  const lineSet = guideContent.split(/\r?\n/);
  const separatorIndex = lineSet.findIndex((line) => line.trim() === "---");
  const lecturerLines =
    separatorIndex >= 0 ? lineSet.slice(0, separatorIndex) : lineSet.slice(0, Math.min(25, lineSet.length));
  const courseLecturerIds = new Set<string>();

  for (const line of lecturerLines) {
    const trimmed = line.trim();

    const inlineLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let inline = inlineLinkRegex.exec(trimmed);
    while (inline) {
      const lecturerName = cleanLecturerName(inline[1]);
      if (lecturerName.length >= 2) {
        const id = slugify(lecturerName);
        const existing = lecturersById.get(id);

        if (existing) {
          existing.profileUrl = existing.profileUrl ?? inline[2];
          existing.courseCodes.add(courseCode);
        } else {
          lecturersById.set(id, {
            id,
            name: lecturerName,
            profileUrl: inline[2],
            courseCodes: new Set([courseCode]),
          });
        }

        courseLecturerIds.add(id);
      }

      inline = inlineLinkRegex.exec(trimmed);
    }

    const refRegex = /\[([^\]]+)\]\[([^\]]+)\]/g;
    let ref = refRegex.exec(trimmed);
    while (ref) {
      const lecturerName = cleanLecturerName(ref[1]);
      const url = referenceLinks.get(ref[2].trim().toLowerCase()) ?? null;
      if (lecturerName.length >= 2) {
        const id = slugify(lecturerName);
        const existing = lecturersById.get(id);
        if (existing) {
          existing.profileUrl = existing.profileUrl ?? url;
          existing.courseCodes.add(courseCode);
        } else {
          lecturersById.set(id, {
            id,
            name: lecturerName,
            profileUrl: url,
            courseCodes: new Set([courseCode]),
          });
        }
        courseLecturerIds.add(id);
      }
      ref = refRegex.exec(trimmed);
    }

    const numberedPlain = trimmed.match(/^\d+\.\s*(.+)$/);
    if (numberedPlain && !trimmed.includes("[") && !trimmed.includes("]")) {
      const lecturerName = cleanLecturerName(numberedPlain[1]);
      if (lecturerName.length >= 2) {
        const id = slugify(lecturerName);
        const existing = lecturersById.get(id);
        if (existing) {
          existing.courseCodes.add(courseCode);
        } else {
          lecturersById.set(id, {
            id,
            name: lecturerName,
            profileUrl: null,
            courseCodes: new Set([courseCode]),
          });
        }
        courseLecturerIds.add(id);
      }
    }
  }

  let reviewIndex = 0;
  for (const line of lineSet) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      continue;
    }

    const content = trimmed.slice(2).trim();
    if (content.length < 12) {
      continue;
    }

    let lecturerId: string | null = null;
    if (courseLecturerIds.size === 1) {
      lecturerId = [...courseLecturerIds][0];
    } else if (courseLecturerIds.size > 1) {
      const normalizedContent = normalizeText(content);
      for (const id of courseLecturerIds) {
        const lecturer = lecturersById.get(id);
        if (!lecturer) {
          continue;
        }

        const keyName = normalizeText(lecturer.name);
        const tokens = keyName.split(/\s+/).filter((token) => token.length >= 3);
        if (tokens.some((token) => normalizedContent.includes(token))) {
          lecturerId = id;
          break;
        }
      }
    }

    const rating = scoreFromContent(content);
    reviews.push({
      id: `${slugify(courseCode)}-${reviewIndex}`,
      courseCode,
      lecturerId,
      lecturerName: lecturerId ? lecturersById.get(lecturerId)?.name ?? null : null,
      content,
      rating,
      sentiment: sentimentFromScore(rating),
      sourceFile: guidePath,
    });

    reviewIndex += 1;
  }
}

function averageRating(reviews: Array<{ rating: number | null }>): number | null {
  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => Number.isFinite(rating));

  if (ratings.length === 0) {
    return null;
  }

  const avg = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  return Number(avg.toFixed(2));
}

function buildKnowledge(catalogCsvPath: string, resourcesDir: string): KnowledgeBundle {
  const catalog = parseCatalog(catalogCsvPath);
  const courseResources = scanCourseResources(resourcesDir);

  const lecturersById = new Map<string, LecturerSeed>();
  const reviews: LecturerReview[] = [];

  for (const [courseCode, courseData] of courseResources.entries()) {
    if (courseData.guidePath && courseData.guideContent) {
      parseGuide(courseCode, courseData.guidePath, courseData.guideContent, lecturersById, reviews);
    }
  }

  const allCourseCodes = new Set<string>([...catalog.keys(), ...courseResources.keys()]);

  const courses: CourseOverview[] = [...allCourseCodes]
    .sort((a, b) => a.localeCompare(b))
    .map((code) => {
      const catalogInfo = catalog.get(code);
      const resourceInfo = courseResources.get(code);

      const courseReviews = reviews.filter((review) => review.courseCode === code);

      const lecturerIds = new Set<string>();
      for (const review of courseReviews) {
        if (review.lecturerId) {
          lecturerIds.add(review.lecturerId);
        }
      }

      for (const lecturer of lecturersById.values()) {
        if (lecturer.courseCodes.has(code)) {
          lecturerIds.add(lecturer.id);
        }
      }

      const lecturerList: LecturerOverview[] = [...lecturerIds]
        .map((id) => lecturersById.get(id))
        .filter((item): item is LecturerSeed => Boolean(item))
        .map((lecturer) => {
          const lecturerReviews = reviews.filter((review) => review.lecturerId === lecturer.id);
          return {
            id: lecturer.id,
            name: lecturer.name,
            profileUrl: lecturer.profileUrl,
            courses: [...lecturer.courseCodes].sort((a, b) => a.localeCompare(b)),
            reviewCount: lecturerReviews.length,
            averageRating: averageRating(lecturerReviews),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        code,
        nameEn: catalogInfo?.nameEn ?? null,
        nameVi: catalogInfo?.nameVi ?? null,
        credits: catalogInfo?.credits ?? null,
        prerequisite: catalogInfo?.prerequisite ?? null,
        note: catalogInfo?.note ?? null,
        program: catalogInfo?.program ?? null,
        section: catalogInfo?.section ?? null,
        resources: resourceInfo?.resources ?? [],
        lecturers: lecturerList,
        reviews: courseReviews,
        averageRating: averageRating(courseReviews),
      };
    });

  const lecturers: LecturerOverview[] = [...lecturersById.values()]
    .map((lecturer) => {
      const lecturerReviews = reviews.filter((review) => review.lecturerId === lecturer.id);
      return {
        id: lecturer.id,
        name: lecturer.name,
        profileUrl: lecturer.profileUrl,
        courses: [...lecturer.courseCodes].sort((a, b) => a.localeCompare(b)),
        reviewCount: lecturerReviews.length,
        averageRating: averageRating(lecturerReviews),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalResources = courses.reduce((sum, course) => sum + course.resources.length, 0);

  return {
    sourcePaths: {
      catalogCsvPath,
      resourcesDir,
    },
    generatedAt: new Date().toISOString(),
    stats: {
      courses: courses.length,
      lecturers: lecturers.length,
      reviews: reviews.length,
      resources: totalResources,
    },
    courses,
    lecturers,
  };
}

export function loadKnowledge(force = false): KnowledgeBundle {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const catalogCsvPath = process.env.CATALOG_CSV_PATH ?? DEFAULT_CATALOG_PATH;
  const resourcesDir = process.env.TROY_RESOURCES_DIR ?? DEFAULT_RESOURCES_DIR;
  const data = buildKnowledge(catalogCsvPath, resourcesDir);

  cache = {
    at: Date.now(),
    data,
  };

  return data;
}

export function getCourseByCode(code: string): CourseOverview | null {
  const normalized = normalizeCourseCode(code);
  if (!normalized) {
    return null;
  }

  const data = loadKnowledge();
  return data.courses.find((course) => course.code === normalized) ?? null;
}

export function getLecturerById(id: string): LecturerOverview | null {
  const data = loadKnowledge();
  return data.lecturers.find((lecturer) => lecturer.id === id) ?? null;
}

export function getReviewsByLecturer(id: string): LecturerReview[] {
  const data = loadKnowledge();
  return data.courses
    .flatMap((course) => course.reviews)
    .filter((review) => review.lecturerId === id);
}

export function getResourcesDirectory(): string {
  return process.env.TROY_RESOURCES_DIR ?? DEFAULT_RESOURCES_DIR;
}

export function resolveResourceFilePath(
  course: string,
  relativeFilePath: string,
): { courseCode: string; absolutePath: string; relativePath: string } | null {
  const courseCode = normalizeCourseCode(course);
  if (!courseCode || !relativeFilePath) {
    return null;
  }

  const baseDir = getResourcesDirectory();
  const courseDir = path.resolve(baseDir, courseCode);
  const targetPath = path.resolve(courseDir, relativeFilePath);

  if (!targetPath.startsWith(courseDir)) {
    return null;
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return null;
  }

  return {
    courseCode,
    absolutePath: targetPath,
    relativePath: relativeFilePath,
  };
}
