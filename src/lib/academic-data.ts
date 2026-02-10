import {
  loadKnowledge,
  normalizeCourseCode,
  normalizeSearchText,
  type CourseOverview,
  type LecturerReview,
} from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";

type Sentiment = LecturerReview["sentiment"];

type SourceType = "seed" | "student";

export type EnhancedLecturer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  courses: string[];
  reviewCount: number;
  averageRating: number | null;
  title: string | null;
  department: string | null;
  email: string | null;
  office: string | null;
  bio: string | null;
  isCustomized: boolean;
};

export type CourseTeachingAssignmentView = {
  id: string;
  courseCode: string;
  semesterKey: string | null;
  classGroupName: string | null;
  instructionCode: string | null;
  lecturerId: string;
  lecturerName: string;
  updatedAt: string;
};

export type EnhancedReview = {
  id: string;
  courseCode: string;
  lecturerId: string | null;
  lecturerName: string | null;
  content: string;
  rating: number | null;
  sentiment: Sentiment;
  sourceFile: string;
  sourceType: SourceType;
  createdAt: string;
  authorName: string | null;
  authorRole: string | null;
};

export type EnhancedCourse = Omit<CourseOverview, "lecturers" | "reviews" | "averageRating"> & {
  lecturers: EnhancedLecturer[];
  reviews: EnhancedReview[];
  averageRating: number | null;
};

export type AcademicBundle = {
  generatedAt: string;
  stats: {
    courses: number;
    lecturers: number;
    reviews: number;
    resources: number;
  };
  courses: EnhancedCourse[];
  lecturers: EnhancedLecturer[];
};

function averageRating(reviews: Array<{ rating: number | null }>): number | null {
  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating));

  if (ratings.length === 0) {
    return null;
  }

  const value = ratings.reduce((sum, current) => sum + current, 0) / ratings.length;
  return Number(value.toFixed(2));
}

function sentimentFromRating(rating: number | null): Sentiment {
  if (rating === null) {
    return "neutral";
  }

  if (rating >= 4) {
    return "positive";
  }

  if (rating <= 2) {
    return "negative";
  }

  return "neutral";
}

function normalizeCourseCodeSafe(code: string): string {
  return normalizeCourseCode(code) ?? code.trim().toUpperCase().replace(/\s+/g, " ");
}

function ensureLecturer(
  map: Map<string, EnhancedLecturer>,
  id: string,
  fallbackName?: string,
): EnhancedLecturer {
  const existing = map.get(id);
  if (existing) {
    return existing;
  }

  const created: EnhancedLecturer = {
    id,
    name: fallbackName ?? id,
    avatarUrl: null,
    profileUrl: null,
    courses: [],
    reviewCount: 0,
    averageRating: null,
    title: null,
    department: null,
    email: null,
    office: null,
    bio: null,
    isCustomized: false,
  };

  map.set(id, created);
  return created;
}

function compareIsoDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function normalizeInstructionCode(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  if (!cleaned) {
    return null;
  }

  return cleaned;
}

function normalizeSemesterKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");

  return cleaned || null;
}

function getCourseTeachingAssignmentDelegate(): {
  findMany: (args: unknown) => Promise<
    Array<{
      id: string;
      courseCode: string;
      semesterKey: string;
      classGroupName: string;
      instructionCode: string;
      lecturerId: string;
      updatedAt: Date;
    }>
  >;
} | null {
  const delegate = (
    prisma as unknown as {
      courseTeachingAssignment?: {
        findMany?: (args: unknown) => Promise<
          Array<{
            id: string;
            courseCode: string;
            semesterKey: string;
            classGroupName: string;
            instructionCode: string;
            lecturerId: string;
            updatedAt: Date;
          }>
        >;
      };
    }
  ).courseTeachingAssignment;

  if (!delegate || typeof delegate.findMany !== "function") {
    return null;
  }

  return {
    findMany: delegate.findMany.bind(delegate),
  };
}

async function loadGlobalCourseLecturerOverrides() {
  try {
    return await prisma.courseLecturerOverride.findMany({
      where: {
        semesterKey: "",
      },
    });
  } catch {
    // Backward-compatible fallback for databases not yet migrated with `semesterKey`.
    return prisma.courseLecturerOverride.findMany();
  }
}

export async function getAcademicBundle(): Promise<AcademicBundle> {
  const base = loadKnowledge();

  const [overrides, studentReviews, courseLecturerOverrides] = await Promise.all([
    prisma.lecturerProfile.findMany(),
    prisma.studentReview.findMany({
      orderBy: [{ createdAt: "desc" }],
    }),
    loadGlobalCourseLecturerOverrides(),
  ]);

  const lecturerMap = new Map<string, EnhancedLecturer>();
  for (const lecturer of base.lecturers) {
    lecturerMap.set(lecturer.id, {
      id: lecturer.id,
      name: lecturer.name,
      avatarUrl: null,
      profileUrl: lecturer.profileUrl,
      courses: [],
      reviewCount: 0,
      averageRating: null,
      title: null,
      department: null,
      email: null,
      office: null,
      bio: null,
      isCustomized: false,
    });
  }

  for (const override of overrides) {
    const lecturer = ensureLecturer(lecturerMap, override.lecturerId, override.name ?? override.lecturerId);

    if (override.name && override.name.trim()) {
      lecturer.name = override.name.trim();
    }
    if (override.avatarUrl !== null) {
      lecturer.avatarUrl = override.avatarUrl;
    }
    if (override.profileUrl !== null) {
      lecturer.profileUrl = override.profileUrl;
    }

    lecturer.title = override.title;
    lecturer.department = override.department;
    lecturer.email = override.email;
    lecturer.office = override.office;
    lecturer.bio = override.bio;
    lecturer.isCustomized = true;
  }

  const courseLecturerRules = new Map<string, { attach: Set<string>; detach: Set<string> }>();
  for (const override of courseLecturerOverrides) {
    const courseCode = normalizeCourseCodeSafe(override.courseCode);
    const lecturerId = override.lecturerId.trim();
    if (!courseCode || !lecturerId) {
      continue;
    }

    const existing = courseLecturerRules.get(courseCode) ?? {
      attach: new Set<string>(),
      detach: new Set<string>(),
    };

    if (override.enabled) {
      existing.attach.add(lecturerId);
      existing.detach.delete(lecturerId);
    } else {
      existing.detach.add(lecturerId);
      existing.attach.delete(lecturerId);
    }

    courseLecturerRules.set(courseCode, existing);
  }

  const reviewByCourse = new Map<string, EnhancedReview[]>();
  const pushReview = (review: EnhancedReview) => {
    const normalizedCode = normalizeCourseCodeSafe(review.courseCode);
    const row = reviewByCourse.get(normalizedCode);
    if (row) {
      row.push({ ...review, courseCode: normalizedCode });
      return;
    }

    reviewByCourse.set(normalizedCode, [{ ...review, courseCode: normalizedCode }]);
  };

  for (const course of base.courses) {
    for (const review of course.reviews) {
      pushReview({
        id: `seed-${review.id}`,
        courseCode: course.code,
        lecturerId: review.lecturerId,
        lecturerName: review.lecturerId
          ? lecturerMap.get(review.lecturerId)?.name ?? review.lecturerName
          : review.lecturerName,
        content: review.content,
        rating: review.rating,
        sentiment: review.sentiment,
        sourceFile: review.sourceFile,
        sourceType: "seed",
        createdAt: base.generatedAt,
        authorName: null,
        authorRole: null,
      });
    }
  }

  for (const studentReview of studentReviews) {
    const courseCode = normalizeCourseCodeSafe(studentReview.courseCode);

    if (studentReview.lecturerId) {
      ensureLecturer(lecturerMap, studentReview.lecturerId, studentReview.lecturerId);
    }

    pushReview({
      id: `student-${studentReview.id}`,
      courseCode,
      lecturerId: studentReview.lecturerId,
      lecturerName: studentReview.lecturerId
        ? lecturerMap.get(studentReview.lecturerId)?.name ?? studentReview.lecturerId
        : null,
      content: studentReview.content,
      rating: studentReview.rating,
      sentiment: sentimentFromRating(studentReview.rating),
      sourceFile: "student-review",
      sourceType: "student",
      createdAt: studentReview.createdAt.toISOString(),
      authorName: studentReview.authorName ?? studentReview.authorUsername,
      authorRole: studentReview.authorRole,
    });
  }

  const courses: EnhancedCourse[] = base.courses.map((course) => {
    const reviews = (reviewByCourse.get(course.code) ?? []).sort((a, b) => compareIsoDesc(a.createdAt, b.createdAt));
    const rules = courseLecturerRules.get(course.code);

    const lecturerIds = new Set(course.lecturers.map((lecturer) => lecturer.id));
    for (const lecturerId of rules?.detach ?? []) {
      lecturerIds.delete(lecturerId);
    }
    for (const lecturerId of rules?.attach ?? []) {
      lecturerIds.add(lecturerId);
      ensureLecturer(lecturerMap, lecturerId, lecturerId);
    }
    const lecturers = [...lecturerIds]
      .map((lecturerId) => lecturerMap.get(lecturerId))
      .filter((lecturer): lecturer is EnhancedLecturer => Boolean(lecturer))
      .map((lecturer) => {
        if (!lecturer.courses.includes(course.code)) {
          lecturer.courses.push(course.code);
        }
        return lecturer;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      code: course.code,
      nameEn: course.nameEn,
      nameVi: course.nameVi,
      credits: course.credits,
      prerequisite: course.prerequisite,
      note: course.note,
      program: course.program,
      section: course.section,
      resources: course.resources,
      lecturers,
      reviews,
      averageRating: averageRating(reviews),
    };
  });

  const reviewByLecturer = new Map<string, EnhancedReview[]>();
  for (const course of courses) {
    for (const review of course.reviews) {
      if (!review.lecturerId) {
        continue;
      }

      const row = reviewByLecturer.get(review.lecturerId);
      if (row) {
        row.push(review);
      } else {
        reviewByLecturer.set(review.lecturerId, [review]);
      }
    }
  }

  const lecturers = [...lecturerMap.values()]
    .map((lecturer) => {
      const lecturerReviews = reviewByLecturer.get(lecturer.id) ?? [];
      return {
        ...lecturer,
        courses: [...new Set(lecturer.courses)].sort((a, b) => a.localeCompare(b)),
        reviewCount: lecturerReviews.length,
        averageRating: averageRating(lecturerReviews),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalResources = courses.reduce((sum, course) => sum + course.resources.length, 0);
  const totalReviews = courses.reduce((sum, course) => sum + course.reviews.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      courses: courses.length,
      lecturers: lecturers.length,
      reviews: totalReviews,
      resources: totalResources,
    },
    courses,
    lecturers,
  };
}

export async function getEnhancedCourseByCode(code: string): Promise<EnhancedCourse | null> {
  const normalizedCode = normalizeCourseCode(code);
  if (!normalizedCode) {
    return null;
  }

  const bundle = await getAcademicBundle();
  return bundle.courses.find((course) => course.code === normalizedCode) ?? null;
}

export async function getEnhancedLecturerById(id: string): Promise<EnhancedLecturer | null> {
  const bundle = await getAcademicBundle();
  return bundle.lecturers.find((lecturer) => lecturer.id === id) ?? null;
}

export async function getCourseTeachingAssignments(
  courseCode: string,
  semesterKey?: string | null,
): Promise<CourseTeachingAssignmentView[]> {
  const normalizedCourse = normalizeCourseCode(courseCode);
  if (!normalizedCourse) {
    return [];
  }

  const assignmentDelegate = getCourseTeachingAssignmentDelegate();
  if (!assignmentDelegate) {
    return [];
  }

  const normalizedSemester = normalizeSemesterKey(semesterKey);

  const [rows, bundle] = await Promise.all([
    assignmentDelegate
      .findMany({
        where: {
          courseCode: normalizedCourse,
          ...(normalizedSemester ? { semesterKey: normalizedSemester } : {}),
          enabled: true,
        },
        orderBy: [
          {
            semesterKey: "asc",
          },
          {
            classGroupName: "asc",
          },
          {
            instructionCode: "asc",
          },
          {
            updatedAt: "desc",
          },
        ],
      })
      .catch(() =>
        assignmentDelegate.findMany({
          where: {
            courseCode: normalizedCourse,
            enabled: true,
          },
          orderBy: [
            {
              classGroupName: "asc",
            },
            {
              instructionCode: "asc",
            },
            {
              updatedAt: "desc",
            },
          ],
        }),
      ),
    getAcademicBundle(),
  ]);

  const lecturerNameMap = new Map(bundle.lecturers.map((lecturer) => [lecturer.id, lecturer.name]));

  return rows.map((row) => ({
    id: row.id,
    courseCode: row.courseCode,
    semesterKey: typeof row.semesterKey === "string" && row.semesterKey.trim() ? row.semesterKey.trim() : null,
    classGroupName: row.classGroupName.trim() || null,
    instructionCode: normalizeInstructionCode(row.instructionCode),
    lecturerId: row.lecturerId,
    lecturerName: lecturerNameMap.get(row.lecturerId) ?? row.lecturerId,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getEnhancedReviewsByLecturer(id: string): Promise<EnhancedReview[]> {
  const bundle = await getAcademicBundle();

  return bundle.courses
    .flatMap((course) => course.reviews)
    .filter((review) => review.lecturerId === id)
    .sort((a, b) => compareIsoDesc(a.createdAt, b.createdAt));
}

export async function searchEnhancedCourses(keyword: string): Promise<EnhancedCourse[]> {
  const bundle = await getAcademicBundle();
  const q = normalizeSearchText(keyword.trim());

  if (!q) {
    return bundle.courses;
  }

  return bundle.courses.filter((course) => {
    return (
      normalizeSearchText(course.code).includes(q) ||
      normalizeSearchText(course.nameEn ?? "").includes(q) ||
      normalizeSearchText(course.nameVi ?? "").includes(q) ||
      normalizeSearchText(course.program ?? "").includes(q) ||
      normalizeSearchText(course.section ?? "").includes(q)
    );
  });
}

export async function searchEnhancedLecturers(keyword: string): Promise<EnhancedLecturer[]> {
  const bundle = await getAcademicBundle();
  const q = normalizeSearchText(keyword.trim());

  if (!q) {
    return bundle.lecturers;
  }

  return bundle.lecturers.filter((lecturer) => {
    return (
      normalizeSearchText(lecturer.name).includes(q) ||
      normalizeSearchText(lecturer.department ?? "").includes(q) ||
      lecturer.courses.some((courseCode) => normalizeSearchText(courseCode).includes(q))
    );
  });
}
