import { DayOfWeek, type ScheduleEntry } from "@prisma/client";

import { loadKnowledge } from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";

const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
  DayOfWeek.SUN,
];

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

type QueryInput = {
  semesterKey?: string;
  cohortCode?: string;
  classGroupName?: string;
  day?: DayOfWeek | "ALL";
};

type LecturerLite = {
  id: string;
  name: string;
};

function normalizeInstructionCode(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }

  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function normalizeClassGroupName(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }

  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeSemesterKey(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }

  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");
}

function extractInstructionCode(value: string | null | undefined): string {
  const text = (value ?? "").toUpperCase();
  const matched = text.match(/\bIHA[A-Z0-9]{1,4}\b/);
  if (!matched) {
    return "";
  }

  return normalizeInstructionCode(matched[0]);
}

function resolveLecturersForEntry(input: {
  courseCode: string;
  classGroupName: string;
  instructionCode: string;
  assignments: Array<{
    courseCode: string;
    classGroupName: string;
    instructionCode: string;
    lecturerId: string;
  }>;
  lecturerNameMap: Map<string, string>;
}): LecturerLite[] {
  let maxScore = -1;
  const matched: string[] = [];

  for (const assignment of input.assignments) {
    if (assignment.courseCode !== input.courseCode) {
      continue;
    }

    let score = 0;

    const assignmentClass = normalizeClassGroupName(assignment.classGroupName);
    if (assignmentClass) {
      if (assignmentClass !== input.classGroupName) {
        continue;
      }
      score += 2;
    }

    const assignmentInstruction = normalizeInstructionCode(assignment.instructionCode);
    if (assignmentInstruction) {
      if (assignmentInstruction !== input.instructionCode) {
        continue;
      }
      score += 1;
    }

    if (score > maxScore) {
      maxScore = score;
      matched.length = 0;
      matched.push(assignment.lecturerId);
    } else if (score === maxScore) {
      matched.push(assignment.lecturerId);
    }
  }

  const uniqueIds = [...new Set(matched)];
  return uniqueIds.map((lecturerId) => ({
    id: lecturerId,
    name: input.lecturerNameMap.get(lecturerId) ?? lecturerId,
  }));
}

export type PortalMeta = {
  semesters: Array<{
    key: string;
    label: string;
    cohorts: Array<{
      code: string;
      classGroups: string[];
    }>;
  }>;
};

export type PortalData = {
  meta: PortalMeta;
  selected: {
    semesterKey: string | null;
    cohortCode: string | null;
    classGroupName: string | null;
    day: DayOfWeek | "ALL";
  };
  entries: Array<{
    id: string;
    dayOfWeek: DayOfWeek;
    dayLabel: string;
    session: string;
    startTime: string | null;
    room: string | null;
    rawTime: string | null;
    course: {
      code: string;
      nameEn: string | null;
      nameVi: string | null;
    };
    instructionCode: string | null;
    lecturers: LecturerLite[];
  }>;
  conflicts: Array<{
    dayOfWeek: DayOfWeek;
    startTime: string;
    courses: string[];
  }>;
};

function sortEntries(a: ScheduleEntry, b: ScheduleEntry): number {
  const dayDelta = DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek);
  if (dayDelta !== 0) {
    return dayDelta;
  }

  const timeA = a.startTime ?? "99:99";
  const timeB = b.startTime ?? "99:99";
  return timeA.localeCompare(timeB);
}

function computeConflicts(entries: PortalData["entries"]): PortalData["conflicts"] {
  const grouped = new Map<string, PortalData["conflicts"][number]>();

  for (const entry of entries) {
    if (!entry.startTime) {
      continue;
    }

    const key = `${entry.dayOfWeek}:${entry.startTime}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        courses: [entry.course.code],
      });
      continue;
    }

    if (!existing.courses.includes(entry.course.code)) {
      existing.courses.push(entry.course.code);
    }
  }

  return [...grouped.values()].filter((conflict) => conflict.courses.length > 1);
}

export async function getPortalMeta(): Promise<PortalMeta> {
  const semesters = await prisma.semester.findMany({
    include: {
      cohorts: {
        include: {
          classGroups: true,
        },
        orderBy: {
          code: "asc",
        },
      },
    },
    orderBy: [{ startDate: "desc" }, { updatedAt: "desc" }],
  });

  return {
    semesters: semesters.map((semester) => ({
      key: semester.key,
      label: semester.label,
      cohorts: semester.cohorts.map((cohort) => ({
        code: cohort.code,
        classGroups: cohort.classGroups.map((classGroup) => classGroup.name).sort((a, b) =>
          a.localeCompare(b),
        ),
      })),
    })),
  };
}

export async function getPortalData(query: QueryInput = {}): Promise<PortalData> {
  const meta = await getPortalMeta();
  const catalog = loadKnowledge();
  const catalogMap = new Map(
    catalog.courses.map((course) => [
      course.code,
      {
        nameEn: course.nameEn,
        nameVi: course.nameVi,
      },
    ]),
  );
  const selectedSemester =
    meta.semesters.find((semester) => semester.key === query.semesterKey) ?? meta.semesters[0] ?? null;

  const selectedCohort =
    selectedSemester?.cohorts.find((cohort) => cohort.code === query.cohortCode) ??
    selectedSemester?.cohorts[0] ??
    null;

  const selectedClassGroup =
    selectedCohort?.classGroups.find((className) => className === query.classGroupName) ??
    selectedCohort?.classGroups[0] ??
    null;

  const selectedDay = query.day ?? "ALL";

  if (!selectedSemester || !selectedCohort || !selectedClassGroup) {
    return {
      meta,
      selected: {
        semesterKey: selectedSemester?.key ?? null,
        cohortCode: selectedCohort?.code ?? null,
        classGroupName: selectedClassGroup,
        day: selectedDay,
      },
      entries: [],
      conflicts: [],
    };
  }

  const semester = await prisma.semester.findUnique({
    where: {
      key: selectedSemester.key,
    },
    select: {
      id: true,
      cohorts: {
        where: {
          code: selectedCohort.code,
        },
        select: {
          id: true,
          classGroups: {
            where: {
              name: selectedClassGroup,
            },
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  const classGroupId = semester?.cohorts[0]?.classGroups[0]?.id;

  if (!semester?.id || !classGroupId) {
    return {
      meta,
      selected: {
        semesterKey: selectedSemester.key,
        cohortCode: selectedCohort.code,
        classGroupName: selectedClassGroup,
        day: selectedDay,
      },
      entries: [],
      conflicts: [],
    };
  }

  const scheduleEntries = await prisma.scheduleEntry.findMany({
    where: {
      semesterId: semester.id,
      classGroupId,
      ...(selectedDay === "ALL" ? {} : { dayOfWeek: selectedDay }),
    },
    include: {
      course: {
        select: {
          code: true,
          nameEn: true,
          nameVi: true,
        },
      },
    },
  });

  scheduleEntries.sort(sortEntries);

  const selectedSemesterKey = normalizeSemesterKey(selectedSemester.key);
  const selectedClassGroupUpper = normalizeClassGroupName(selectedClassGroup);
  const selectedCourseCodes = [...new Set(scheduleEntries.map((entry) => entry.course.code))];
  const catalogLecturerNameMap = new Map(catalog.lecturers.map((lecturer) => [lecturer.id, lecturer.name]));
  const catalogLecturerIdsByCourse = new Map<string, Set<string>>();
  for (const course of catalog.courses) {
    catalogLecturerIdsByCourse.set(
      course.code,
      new Set(course.lecturers.map((lecturer) => lecturer.id)),
    );
  }

  const teachingAssignmentDelegate = (
    prisma as unknown as {
      courseTeachingAssignment?: {
        findMany?: (args: unknown) => Promise<
          Array<{
            courseCode: string;
            classGroupName: string;
            instructionCode: string;
            lecturerId: string;
          }>
        >;
      };
    }
  ).courseTeachingAssignment;

  const courseLecturerOverrideDelegate = (
    prisma as unknown as {
      courseLecturerOverride?: {
        findMany?: (args: unknown) => Promise<
          Array<{
            courseCode: string;
            lecturerId: string;
            enabled: boolean;
          }>
        >;
      };
    }
  ).courseLecturerOverride;

  const [teachingAssignments, courseLecturerOverrides] = await Promise.all([
    teachingAssignmentDelegate?.findMany
      ? teachingAssignmentDelegate
          .findMany({
            where: {
              enabled: true,
              semesterKey: selectedSemesterKey,
              courseCode: {
                in: selectedCourseCodes,
              },
              OR: [{ classGroupName: "" }, { classGroupName: selectedClassGroupUpper }],
            },
            select: {
              courseCode: true,
              classGroupName: true,
              instructionCode: true,
              lecturerId: true,
            },
          })
          .catch(() =>
            teachingAssignmentDelegate.findMany!({
              where: {
                enabled: true,
                courseCode: {
                  in: selectedCourseCodes,
                },
                OR: [{ classGroupName: "" }, { classGroupName: selectedClassGroupUpper }],
              },
              select: {
                courseCode: true,
                classGroupName: true,
                instructionCode: true,
                lecturerId: true,
              },
            }),
          )
      : Promise.resolve([]),
    courseLecturerOverrideDelegate?.findMany
      ? courseLecturerOverrideDelegate
          .findMany({
            where: {
              semesterKey: selectedSemesterKey,
              courseCode: {
                in: selectedCourseCodes,
              },
            },
            select: {
              courseCode: true,
              lecturerId: true,
              enabled: true,
            },
          })
          .catch(() =>
            courseLecturerOverrideDelegate.findMany!({
              where: {
                courseCode: {
                  in: selectedCourseCodes,
                },
              },
              select: {
                courseCode: true,
                lecturerId: true,
                enabled: true,
              },
            }),
          )
      : Promise.resolve([]),
  ]);

  const fallbackLecturerIdsByCourse = new Map<string, Set<string>>();
  for (const courseCode of selectedCourseCodes) {
    fallbackLecturerIdsByCourse.set(courseCode, new Set(catalogLecturerIdsByCourse.get(courseCode) ?? []));
  }

  for (const override of courseLecturerOverrides) {
    const row = fallbackLecturerIdsByCourse.get(override.courseCode) ?? new Set<string>();
    if (override.enabled) {
      row.add(override.lecturerId);
    } else {
      row.delete(override.lecturerId);
    }
    fallbackLecturerIdsByCourse.set(override.courseCode, row);
  }

  const lecturerIdsForLookup = new Set<string>();
  for (const assignment of teachingAssignments) {
    lecturerIdsForLookup.add(assignment.lecturerId);
  }
  for (const row of fallbackLecturerIdsByCourse.values()) {
    for (const lecturerId of row) {
      lecturerIdsForLookup.add(lecturerId);
    }
  }

  const lecturerProfiles =
    lecturerIdsForLookup.size > 0
      ? await prisma.lecturerProfile.findMany({
          where: {
            lecturerId: {
              in: [...lecturerIdsForLookup],
            },
          },
          select: {
            lecturerId: true,
            name: true,
          },
        })
      : [];

  const lecturerNameMap = new Map<string, string>(catalogLecturerNameMap);
  for (const profile of lecturerProfiles) {
    if (profile.name && profile.name.trim()) {
      lecturerNameMap.set(profile.lecturerId, profile.name.trim());
    }
  }

  const toLecturerLite = (lecturerId: string): LecturerLite => ({
    id: lecturerId,
    name: lecturerNameMap.get(lecturerId) ?? lecturerId,
  });

  const normalizedEntries: PortalData["entries"] = scheduleEntries.map((entry) => {
    const fallback = catalogMap.get(entry.course.code);
    const instructionCode = extractInstructionCode(entry.room ?? entry.rawTime);
    const lecturers = resolveLecturersForEntry({
      courseCode: entry.course.code,
      classGroupName: selectedClassGroupUpper,
      instructionCode,
      assignments: teachingAssignments,
      lecturerNameMap,
    });
    const fallbackLecturers =
      lecturers.length > 0
        ? lecturers
        : [...new Set(fallbackLecturerIdsByCourse.get(entry.course.code) ?? [])]
            .map(toLecturerLite)
            .sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      dayLabel: DAY_LABEL[entry.dayOfWeek],
      session: entry.session,
      startTime: entry.startTime,
      rawTime: entry.rawTime,
      room: entry.room,
      course: {
        code: entry.course.code,
        nameEn: entry.course.nameEn ?? fallback?.nameEn ?? null,
        nameVi: entry.course.nameVi ?? fallback?.nameVi ?? null,
      },
      instructionCode: instructionCode || null,
      lecturers: fallbackLecturers,
    };
  });

  return {
    meta,
    selected: {
      semesterKey: selectedSemester.key,
      cohortCode: selectedCohort.code,
      classGroupName: selectedClassGroup,
      day: selectedDay,
    },
    entries: normalizedEntries,
    conflicts: computeConflicts(normalizedEntries),
  };
}

export const DAY_OPTIONS: Array<{ value: DayOfWeek | "ALL"; label: string }> = [
  { value: "ALL", label: "All days" },
  { value: DayOfWeek.MON, label: "Monday" },
  { value: DayOfWeek.TUE, label: "Tuesday" },
  { value: DayOfWeek.WED, label: "Wednesday" },
  { value: DayOfWeek.THU, label: "Thursday" },
  { value: DayOfWeek.FRI, label: "Friday" },
  { value: DayOfWeek.SAT, label: "Saturday" },
  { value: DayOfWeek.SUN, label: "Sunday" },
];

export const ORDERED_DAYS = DAY_ORDER;
