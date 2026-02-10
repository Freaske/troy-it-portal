import { DayOfWeek, SessionPeriod } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/request-session";
import { normalizeCourseCode } from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";

type EntityType = "semester" | "cohort" | "classGroup" | "scheduleEntry";

type RawBody = Record<string, unknown> & {
  type?: unknown;
};

function cleanText(value: unknown, maxLength = 180): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeSemesterKey(raw: unknown): string | null {
  const cleaned = cleanText(raw, 80)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");

  return cleaned || null;
}

function normalizeCohortCode(raw: unknown): string | null {
  const cleaned = cleanText(raw, 40)
    .toUpperCase()
    .replace(/\s+/g, " ");

  return cleaned || null;
}

function normalizeClassGroupName(raw: unknown): string | null {
  const cleaned = cleanText(raw, 80)
    .toUpperCase()
    .replace(/\s+/g, " ");

  return cleaned || null;
}

function normalizeOptionalCourseCode(raw: unknown): string | null {
  const cleaned = cleanText(raw, 40);
  if (!cleaned) {
    return null;
  }

  return normalizeCourseCode(cleaned);
}

function normalizeDayOfWeek(raw: unknown): DayOfWeek | null {
  const cleaned = cleanText(raw, 10).toUpperCase();
  return Object.values(DayOfWeek).includes(cleaned as DayOfWeek) ? (cleaned as DayOfWeek) : null;
}

function normalizeSession(raw: unknown): SessionPeriod | null {
  const cleaned = cleanText(raw, 20).toUpperCase();
  return Object.values(SessionPeriod).includes(cleaned as SessionPeriod) ? (cleaned as SessionPeriod) : null;
}

function normalizeTimeOrNull(raw: unknown): string | null {
  const cleaned = cleanText(raw, 10);
  if (!cleaned) {
    return null;
  }

  const matched = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function normalizeDateOrNull(raw: unknown): Date | null {
  const cleaned = cleanText(raw, 40);
  if (!cleaned) {
    return null;
  }

  const value = new Date(cleaned);
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value;
}

function normalizeIntOrNull(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }

  const cleaned = cleanText(raw, 20);
  if (!cleaned) {
    return null;
  }

  const value = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function hasOwn(body: RawBody, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function hasAcademicDelegates(): boolean {
  const db = prisma as unknown as {
    semester?: unknown;
    cohort?: unknown;
    classGroup?: unknown;
    course?: unknown;
    scheduleEntry?: unknown;
  };

  return Boolean(db.semester && db.cohort && db.classGroup && db.course && db.scheduleEntry);
}

async function requireAdmin(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "ADMIN") {
    return null;
  }

  return session;
}

async function resolveScope(
  semesterKeyRaw: unknown,
  cohortCodeRaw: unknown,
  classGroupNameRaw?: unknown,
): Promise<
  | {
      semester: { id: string; key: string };
      cohort: { id: string; code: string };
      classGroup: { id: string; name: string } | null;
      semesterKey: string;
      cohortCode: string;
      classGroupName: string | null;
    }
  | null
> {
  const semesterKey = normalizeSemesterKey(semesterKeyRaw);
  const cohortCode = normalizeCohortCode(cohortCodeRaw);
  const classGroupName = classGroupNameRaw === undefined ? null : normalizeClassGroupName(classGroupNameRaw);

  if (!semesterKey || !cohortCode) {
    return null;
  }

  const semester = await prisma.semester.findUnique({
    where: {
      key: semesterKey,
    },
    select: {
      id: true,
      key: true,
    },
  });

  if (!semester) {
    return null;
  }

  const cohort = await prisma.cohort.findUnique({
    where: {
      semesterId_code: {
        semesterId: semester.id,
        code: cohortCode,
      },
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (!cohort) {
    return null;
  }

  if (classGroupNameRaw === undefined) {
    return {
      semester,
      cohort,
      classGroup: null,
      semesterKey,
      cohortCode,
      classGroupName: null,
    };
  }

  if (!classGroupName) {
    return null;
  }

  const classGroup = await prisma.classGroup.findUnique({
    where: {
      cohortId_name: {
        cohortId: cohort.id,
        name: classGroupName,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!classGroup) {
    return null;
  }

  return {
    semester,
    cohort,
    classGroup,
    semesterKey,
    cohortCode,
    classGroupName,
  };
}

async function renameSemesterKeyInAssignments(oldKey: string, newKey: string) {
  const db = prisma as unknown as {
    courseLecturerOverride?: { updateMany?: (args: unknown) => Promise<unknown> };
    courseTeachingAssignment?: { updateMany?: (args: unknown) => Promise<unknown> };
  };

  if (db.courseLecturerOverride?.updateMany) {
    await db.courseLecturerOverride.updateMany({
      where: { semesterKey: oldKey },
      data: { semesterKey: newKey },
    });
  }

  if (db.courseTeachingAssignment?.updateMany) {
    await db.courseTeachingAssignment.updateMany({
      where: { semesterKey: oldKey },
      data: { semesterKey: newKey },
    });
  }
}

async function deleteSemesterAssignments(semesterKey: string) {
  const db = prisma as unknown as {
    courseLecturerOverride?: { deleteMany?: (args: unknown) => Promise<unknown> };
    courseTeachingAssignment?: { deleteMany?: (args: unknown) => Promise<unknown> };
  };

  if (db.courseTeachingAssignment?.deleteMany) {
    await db.courseTeachingAssignment.deleteMany({
      where: { semesterKey },
    });
  }

  if (db.courseLecturerOverride?.deleteMany) {
    await db.courseLecturerOverride.deleteMany({
      where: { semesterKey },
    });
  }
}

async function deleteClassGroupAssignments(semesterKey: string, classGroupNames: string[]) {
  if (classGroupNames.length === 0) {
    return;
  }

  const db = prisma as unknown as {
    courseTeachingAssignment?: { deleteMany?: (args: unknown) => Promise<unknown> };
  };

  if (db.courseTeachingAssignment?.deleteMany) {
    await db.courseTeachingAssignment.deleteMany({
      where: {
        semesterKey,
        classGroupName: { in: classGroupNames },
      },
    });
  }
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const semesters = await prisma.semester.findMany({
    orderBy: [{ startDate: "desc" }, { updatedAt: "desc" }],
    select: {
      key: true,
      label: true,
      _count: {
        select: {
          cohorts: true,
          entries: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    semesters: semesters.map((semester) => ({
      key: semester.key,
      label: semester.label,
      cohorts: semester._count.cohorts,
      entries: semester._count.entries,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!hasAcademicDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: RawBody;
  try {
    body = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const type = cleanText(body.type, 40) as EntityType;

  try {
    if (type === "semester") {
      const semesterKey = normalizeSemesterKey(body.semesterKey);
      if (!semesterKey) {
        return NextResponse.json({ ok: false, error: "Semester key is required." }, { status: 400 });
      }

      const label = cleanText(body.label, 160) || semesterKey;
      const startDate = normalizeDateOrNull(body.startDate);
      const endDate = normalizeDateOrNull(body.endDate);

      const semester = await prisma.semester.create({
        data: {
          key: semesterKey,
          label,
          startDate,
          endDate,
          sourceFile: "ADMIN_MANUAL",
        },
      });

      return NextResponse.json({ ok: true, type, semester: { key: semester.key, label: semester.label } });
    }

    if (type === "cohort") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode);
      if (scope) {
        return NextResponse.json({ ok: false, error: "Cohort already exists." }, { status: 409 });
      }

      const semesterKey = normalizeSemesterKey(body.semesterKey);
      const cohortCode = normalizeCohortCode(body.cohortCode);
      if (!semesterKey || !cohortCode) {
        return NextResponse.json({ ok: false, error: "Semester and cohort are required." }, { status: 400 });
      }

      const semester = await prisma.semester.findUnique({
        where: { key: semesterKey },
        select: { id: true },
      });
      if (!semester) {
        return NextResponse.json({ ok: false, error: "Semester not found." }, { status: 404 });
      }

      const cohort = await prisma.cohort.create({
        data: {
          semesterId: semester.id,
          code: cohortCode,
        },
      });

      return NextResponse.json({ ok: true, type, cohort: { code: cohort.code, semesterKey } });
    }

    if (type === "classGroup") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode, body.classGroupName);
      if (scope) {
        return NextResponse.json({ ok: false, error: "Class group already exists." }, { status: 409 });
      }

      const target = await resolveScope(body.semesterKey, body.cohortCode);
      const classGroupName = normalizeClassGroupName(body.classGroupName);
      const copyFromClassGroupName = normalizeClassGroupName(body.copyFromClassGroupName);
      if (!target || !classGroupName) {
        return NextResponse.json({ ok: false, error: "Semester, cohort, and class group are required." }, { status: 400 });
      }

      let sourceClassGroupId: string | null = null;
      if (copyFromClassGroupName) {
        const sourceClassGroup = await prisma.classGroup.findUnique({
          where: {
            cohortId_name: {
              cohortId: target.cohort.id,
              name: copyFromClassGroupName,
            },
          },
          select: {
            id: true,
          },
        });

        if (!sourceClassGroup) {
          return NextResponse.json(
            { ok: false, error: "Source class group to copy was not found in selected cohort." },
            { status: 404 },
          );
        }

        sourceClassGroupId = sourceClassGroup.id;
      }

      const classGroup = await prisma.classGroup.create({
        data: {
          cohortId: target.cohort.id,
          name: classGroupName,
        },
        select: {
          id: true,
          name: true,
        },
      });

      let copiedEntries = 0;
      let copiedTeachingAssignments = 0;

      if (sourceClassGroupId && copyFromClassGroupName) {
        const sourceEntries = await prisma.scheduleEntry.findMany({
          where: {
            semesterId: target.semester.id,
            classGroupId: sourceClassGroupId,
          },
          select: {
            courseId: true,
            dayOfWeek: true,
            session: true,
            startTime: true,
            rawTime: true,
            room: true,
            sourceSheet: true,
            sourceRow: true,
          },
        });

        for (const sourceEntry of sourceEntries) {
          await prisma.scheduleEntry.create({
            data: {
              semesterId: target.semester.id,
              classGroupId: classGroup.id,
              courseId: sourceEntry.courseId,
              dayOfWeek: sourceEntry.dayOfWeek,
              session: sourceEntry.session,
              startTime: sourceEntry.startTime,
              rawTime: sourceEntry.rawTime,
              room: sourceEntry.room,
              sourceSheet: sourceEntry.sourceSheet,
              sourceRow: sourceEntry.sourceRow,
            },
          });
        }
        copiedEntries = sourceEntries.length;

        const db = prisma as unknown as {
          courseTeachingAssignment?: {
            findMany?: (args: unknown) => Promise<
              Array<{
                courseCode: string;
                instructionCode: string;
                lecturerId: string;
                enabled: boolean;
              }>
            >;
            upsert?: (args: unknown) => Promise<unknown>;
          };
        };

        if (db.courseTeachingAssignment?.findMany && db.courseTeachingAssignment?.upsert) {
          const sourceAssignments = await db.courseTeachingAssignment.findMany({
            where: {
              semesterKey: target.semester.key,
              classGroupName: copyFromClassGroupName,
              enabled: true,
            },
            select: {
              courseCode: true,
              instructionCode: true,
              lecturerId: true,
              enabled: true,
            },
          });

          for (const assignment of sourceAssignments) {
            await db.courseTeachingAssignment.upsert({
              where: {
                courseCode_semesterKey_classGroupName_instructionCode_lecturerId: {
                  courseCode: assignment.courseCode,
                  semesterKey: target.semester.key,
                  classGroupName,
                  instructionCode: assignment.instructionCode,
                  lecturerId: assignment.lecturerId,
                },
              },
              create: {
                courseCode: assignment.courseCode,
                semesterKey: target.semester.key,
                classGroupName,
                instructionCode: assignment.instructionCode,
                lecturerId: assignment.lecturerId,
                enabled: assignment.enabled,
                updatedBy: session.username,
              },
              update: {
                enabled: assignment.enabled,
                updatedBy: session.username,
              },
            });
          }
          copiedTeachingAssignments = sourceAssignments.length;
        }
      }

      return NextResponse.json({
        ok: true,
        type,
        classGroup: { name: classGroup.name, cohortCode: target.cohort.code, semesterKey: target.semester.key },
        copiedEntries,
        copiedTeachingAssignments,
        copiedFromClassGroupName: copyFromClassGroupName || null,
      });
    }

    if (type === "scheduleEntry") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode, body.classGroupName);
      if (!scope || !scope.classGroup) {
        return NextResponse.json({ ok: false, error: "Invalid semester/cohort/class group." }, { status: 400 });
      }

      const courseCode = normalizeOptionalCourseCode(body.courseCode);
      const dayOfWeek = normalizeDayOfWeek(body.dayOfWeek);
      const sessionPeriod = normalizeSession(body.session);
      const startTime = normalizeTimeOrNull(body.startTime);
      const room = cleanText(body.room, 180) || null;
      const rawTime = cleanText(body.rawTime, 180) || null;
      const sourceSheet = cleanText(body.sourceSheet, 120) || "ADMIN_MANUAL";
      const sourceRow = normalizeIntOrNull(body.sourceRow) ?? Math.floor(Date.now() % 2_000_000_000);
      const courseNameEn = cleanText(body.courseNameEn, 220) || null;
      const courseNameVi = cleanText(body.courseNameVi, 220) || null;

      if (!courseCode || !dayOfWeek || !sessionPeriod) {
        return NextResponse.json(
          { ok: false, error: "courseCode, dayOfWeek, and session are required." },
          { status: 400 },
        );
      }

      const course = await prisma.course.upsert({
        where: {
          code: courseCode,
        },
        create: {
          code: courseCode,
          ...(courseNameEn ? { nameEn: courseNameEn } : {}),
          ...(courseNameVi ? { nameVi: courseNameVi } : {}),
        },
        update: {
          ...(courseNameEn ? { nameEn: courseNameEn } : {}),
          ...(courseNameVi ? { nameVi: courseNameVi } : {}),
        },
      });

      const created = await prisma.scheduleEntry.create({
        data: {
          semesterId: scope.semester.id,
          classGroupId: scope.classGroup.id,
          courseId: course.id,
          dayOfWeek,
          session: sessionPeriod,
          startTime,
          rawTime,
          room,
          sourceSheet,
          sourceRow,
        },
      });

      return NextResponse.json({ ok: true, type, scheduleEntry: { id: created.id } });
    }

    return NextResponse.json({ ok: false, error: "Unsupported type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create entity.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasAcademicDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: RawBody;
  try {
    body = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const type = cleanText(body.type, 40) as EntityType;

  try {
    if (type === "semester") {
      const semesterKey = normalizeSemesterKey(body.semesterKey);
      if (!semesterKey) {
        return NextResponse.json({ ok: false, error: "semesterKey is required." }, { status: 400 });
      }

      const semester = await prisma.semester.findUnique({
        where: { key: semesterKey },
        select: { id: true, key: true },
      });
      if (!semester) {
        return NextResponse.json({ ok: false, error: "Semester not found." }, { status: 404 });
      }

      const newSemesterKey = normalizeSemesterKey(body.newSemesterKey);
      const nextLabel = cleanText(body.label, 160);
      const patch: {
        key?: string;
        label?: string;
        startDate?: Date | null;
        endDate?: Date | null;
      } = {};

      if (newSemesterKey && newSemesterKey !== semester.key) {
        patch.key = newSemesterKey;
      }
      if (nextLabel) {
        patch.label = nextLabel;
      }
      if (hasOwn(body, "startDate")) {
        patch.startDate = normalizeDateOrNull(body.startDate);
      }
      if (hasOwn(body, "endDate")) {
        patch.endDate = normalizeDateOrNull(body.endDate);
      }

      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ ok: false, error: "No update fields provided." }, { status: 400 });
      }

      const updated = await prisma.semester.update({
        where: { key: semester.key },
        data: patch,
        select: {
          key: true,
          label: true,
        },
      });

      if (patch.key && patch.key !== semester.key) {
        await renameSemesterKeyInAssignments(semester.key, patch.key);
      }

      return NextResponse.json({ ok: true, type, semester: updated });
    }

    if (type === "cohort") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode);
      if (!scope) {
        return NextResponse.json({ ok: false, error: "Cohort scope not found." }, { status: 404 });
      }

      const newCode = normalizeCohortCode(body.newCohortCode);
      if (!newCode) {
        return NextResponse.json({ ok: false, error: "newCohortCode is required." }, { status: 400 });
      }

      const updated = await prisma.cohort.update({
        where: {
          semesterId_code: {
            semesterId: scope.semester.id,
            code: scope.cohort.code,
          },
        },
        data: {
          code: newCode,
        },
        select: {
          code: true,
        },
      });

      return NextResponse.json({ ok: true, type, cohort: updated });
    }

    if (type === "classGroup") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode, body.classGroupName);
      if (!scope || !scope.classGroup || !scope.classGroupName) {
        return NextResponse.json({ ok: false, error: "Class group scope not found." }, { status: 404 });
      }

      const newClassGroupName = normalizeClassGroupName(body.newClassGroupName);
      if (!newClassGroupName) {
        return NextResponse.json({ ok: false, error: "newClassGroupName is required." }, { status: 400 });
      }

      const oldClassGroupName = scope.classGroupName;
      const updated = await prisma.classGroup.update({
        where: {
          cohortId_name: {
            cohortId: scope.cohort.id,
            name: scope.classGroupName,
          },
        },
        data: {
          name: newClassGroupName,
        },
        select: {
          name: true,
        },
      });

      if (oldClassGroupName !== newClassGroupName) {
        const db = prisma as unknown as {
          courseTeachingAssignment?: { updateMany?: (args: unknown) => Promise<unknown> };
        };
        if (db.courseTeachingAssignment?.updateMany) {
          await db.courseTeachingAssignment.updateMany({
            where: {
              semesterKey: scope.semester.key,
              classGroupName: oldClassGroupName,
            },
            data: {
              classGroupName: newClassGroupName,
            },
          });
        }
      }

      return NextResponse.json({ ok: true, type, classGroup: updated });
    }

    if (type === "scheduleEntry") {
      const entryId = cleanText(body.id, 80);
      if (!entryId) {
        return NextResponse.json({ ok: false, error: "schedule entry id is required." }, { status: 400 });
      }

      const currentEntry = await prisma.scheduleEntry.findUnique({
        where: { id: entryId },
        include: {
          semester: {
            select: {
              key: true,
            },
          },
          classGroup: {
            select: {
              name: true,
              cohort: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      });

      if (!currentEntry) {
        return NextResponse.json({ ok: false, error: "Schedule entry not found." }, { status: 404 });
      }

      const updatePatch: {
        semesterId?: string;
        classGroupId?: string;
        courseId?: string;
        dayOfWeek?: DayOfWeek;
        session?: SessionPeriod;
        startTime?: string | null;
        room?: string | null;
        rawTime?: string | null;
        sourceSheet?: string;
        sourceRow?: number;
      } = {};

      if (hasOwn(body, "courseCode")) {
        const courseCode = normalizeOptionalCourseCode(body.courseCode);
        if (!courseCode) {
          return NextResponse.json({ ok: false, error: "Invalid course code." }, { status: 400 });
        }

        const courseNameEn = cleanText(body.courseNameEn, 220) || null;
        const courseNameVi = cleanText(body.courseNameVi, 220) || null;
        const course = await prisma.course.upsert({
          where: { code: courseCode },
          create: {
            code: courseCode,
            ...(courseNameEn ? { nameEn: courseNameEn } : {}),
            ...(courseNameVi ? { nameVi: courseNameVi } : {}),
          },
          update: {
            ...(courseNameEn ? { nameEn: courseNameEn } : {}),
            ...(courseNameVi ? { nameVi: courseNameVi } : {}),
          },
          select: { id: true },
        });

        updatePatch.courseId = course.id;
      }

      if (hasOwn(body, "dayOfWeek")) {
        const dayOfWeek = normalizeDayOfWeek(body.dayOfWeek);
        if (!dayOfWeek) {
          return NextResponse.json({ ok: false, error: "Invalid dayOfWeek." }, { status: 400 });
        }
        updatePatch.dayOfWeek = dayOfWeek;
      }

      if (hasOwn(body, "session")) {
        const sessionPeriod = normalizeSession(body.session);
        if (!sessionPeriod) {
          return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 400 });
        }
        updatePatch.session = sessionPeriod;
      }

      if (hasOwn(body, "startTime")) {
        const startTime = normalizeTimeOrNull(body.startTime);
        if (body.startTime && startTime === null) {
          return NextResponse.json({ ok: false, error: "Invalid startTime. Use HH:MM." }, { status: 400 });
        }
        updatePatch.startTime = startTime;
      }

      if (hasOwn(body, "room")) {
        updatePatch.room = cleanText(body.room, 180) || null;
      }

      if (hasOwn(body, "rawTime")) {
        updatePatch.rawTime = cleanText(body.rawTime, 180) || null;
      }

      if (hasOwn(body, "sourceSheet")) {
        updatePatch.sourceSheet = cleanText(body.sourceSheet, 120) || "ADMIN_MANUAL";
      }

      if (hasOwn(body, "sourceRow")) {
        const sourceRow = normalizeIntOrNull(body.sourceRow);
        if (sourceRow === null) {
          return NextResponse.json({ ok: false, error: "Invalid sourceRow." }, { status: 400 });
        }
        updatePatch.sourceRow = sourceRow;
      }

      if (hasOwn(body, "semesterKey") || hasOwn(body, "cohortCode") || hasOwn(body, "classGroupName")) {
        const targetSemesterKey = hasOwn(body, "semesterKey") ? body.semesterKey : currentEntry.semester.key;
        const targetCohortCode = hasOwn(body, "cohortCode") ? body.cohortCode : currentEntry.classGroup.cohort.code;
        const targetClassGroupName = hasOwn(body, "classGroupName") ? body.classGroupName : currentEntry.classGroup.name;

        const targetScope = await resolveScope(targetSemesterKey, targetCohortCode, targetClassGroupName);
        if (!targetScope || !targetScope.classGroup) {
          return NextResponse.json({ ok: false, error: "Invalid target semester/cohort/class group." }, { status: 400 });
        }

        updatePatch.semesterId = targetScope.semester.id;
        updatePatch.classGroupId = targetScope.classGroup.id;
      }

      if (Object.keys(updatePatch).length === 0) {
        return NextResponse.json({ ok: false, error: "No update fields provided." }, { status: 400 });
      }

      await prisma.scheduleEntry.update({
        where: { id: entryId },
        data: updatePatch,
      });

      return NextResponse.json({ ok: true, type, scheduleEntry: { id: entryId } });
    }

    return NextResponse.json({ ok: false, error: "Unsupported type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to update entity.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasAcademicDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: RawBody;
  try {
    body = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const type = cleanText(body.type, 40) as EntityType;

  try {
    if (type === "semester") {
      const semesterKey = normalizeSemesterKey(body.semesterKey);
      if (!semesterKey) {
        return NextResponse.json({ ok: false, error: "semesterKey is required." }, { status: 400 });
      }

      await deleteSemesterAssignments(semesterKey);
      await prisma.semester.delete({
        where: {
          key: semesterKey,
        },
      });

      return NextResponse.json({ ok: true, type, semesterKey });
    }

    if (type === "cohort") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode);
      if (!scope) {
        return NextResponse.json({ ok: false, error: "Cohort not found." }, { status: 404 });
      }

      const classGroups = await prisma.classGroup.findMany({
        where: {
          cohortId: scope.cohort.id,
        },
        select: {
          name: true,
        },
      });

      await deleteClassGroupAssignments(
        scope.semester.key,
        classGroups.map((item) => item.name),
      );
      await prisma.cohort.delete({
        where: {
          semesterId_code: {
            semesterId: scope.semester.id,
            code: scope.cohort.code,
          },
        },
      });

      return NextResponse.json({ ok: true, type, cohortCode: scope.cohort.code });
    }

    if (type === "classGroup") {
      const scope = await resolveScope(body.semesterKey, body.cohortCode, body.classGroupName);
      if (!scope || !scope.classGroup || !scope.classGroupName) {
        return NextResponse.json({ ok: false, error: "Class group not found." }, { status: 404 });
      }

      await deleteClassGroupAssignments(scope.semester.key, [scope.classGroupName!]);
      await prisma.classGroup.delete({
        where: {
          cohortId_name: {
            cohortId: scope.cohort.id,
            name: scope.classGroupName!,
          },
        },
      });

      return NextResponse.json({ ok: true, type, classGroupName: scope.classGroup.name });
    }

    if (type === "scheduleEntry") {
      const id = cleanText(body.id, 80);
      if (!id) {
        return NextResponse.json({ ok: false, error: "schedule entry id is required." }, { status: 400 });
      }

      await prisma.scheduleEntry.delete({
        where: {
          id,
        },
      });

      return NextResponse.json({ ok: true, type, id });
    }

    return NextResponse.json({ ok: false, error: "Unsupported type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to delete entity.",
      },
      { status: 500 },
    );
  }
}
