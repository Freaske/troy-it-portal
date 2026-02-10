import { NextRequest, NextResponse } from "next/server";

import { getEnhancedCourseByCode } from "@/lib/academic-data";
import { getRequestSession } from "@/lib/auth/request-session";
import { normalizeCourseCode } from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";

type CourseLecturerBody = {
  courseCode?: unknown;
  semesterKey?: unknown;
  lecturerId?: unknown;
  lecturerName?: unknown;
  classGroupName?: unknown;
  instructionCode?: unknown;
  scope?: unknown;
};

type AssignmentScope = "SEMESTER" | "GLOBAL";

function cleanText(value: unknown, maxLength = 180): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeLecturerId(raw: unknown): string | null {
  const text = cleanText(raw, 140);
  if (!text) {
    return null;
  }

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || null;
}

function normalizeClassGroupName(raw: unknown): string {
  const cleaned = cleanText(raw, 80).toUpperCase().replace(/\s+/g, " ");
  return cleaned || "";
}

function normalizeInstructionCode(raw: unknown): string {
  const cleaned = cleanText(raw, 40)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return cleaned || "";
}

function normalizeSemesterKey(raw: unknown): string | null {
  const cleaned = cleanText(raw, 80)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");

  return cleaned || null;
}

function normalizeScope(raw: unknown): AssignmentScope {
  const cleaned = cleanText(raw, 20).toUpperCase();
  return cleaned === "GLOBAL" ? "GLOBAL" : "SEMESTER";
}

function hasAssignmentDelegates(): boolean {
  const db = prisma as unknown as {
    courseLecturerOverride?: unknown;
    courseTeachingAssignment?: unknown;
  };

  return Boolean(db.courseLecturerOverride && db.courseTeachingAssignment);
}

async function parseCourseAndLecturer(body: CourseLecturerBody) {
  const courseCode = normalizeCourseCode(cleanText(body.courseCode, 40));
  const scope = normalizeScope(body.scope);
  const semesterKey = normalizeSemesterKey(body.semesterKey);
  const lecturerId = normalizeLecturerId(body.lecturerId);
  const lecturerName = cleanText(body.lecturerName, 140) || null;

  if (!courseCode || !lecturerId) {
    return null;
  }

  const course = await getEnhancedCourseByCode(courseCode);
  if (!course) {
    return null;
  }

  if (scope === "SEMESTER" && !semesterKey) {
    return null;
  }

  if (scope === "SEMESTER") {
    const semester = await prisma.semester.findUnique({
      where: {
        key: semesterKey!,
      },
      select: {
        key: true,
      },
    });

    if (!semester) {
      return null;
    }
  }

  return {
    courseCode,
    semesterKey: scope === "GLOBAL" ? "" : semesterKey!,
    scope,
    lecturerId,
    lecturerName,
    classGroupName: normalizeClassGroupName(body.classGroupName),
    instructionCode: normalizeInstructionCode(body.instructionCode),
  };
}

export async function POST(request: NextRequest) {
  if (!hasAssignmentDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client is not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await getRequestSession(request);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: CourseLecturerBody;
  try {
    body = (await request.json()) as CourseLecturerBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = await parseCourseAndLecturer(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Invalid course or lecturer." }, { status: 400 });
  }

  const { courseCode, semesterKey, scope, lecturerId, lecturerName, classGroupName, instructionCode } = parsed;

  if (scope === "GLOBAL" && (classGroupName || instructionCode)) {
    return NextResponse.json(
      { ok: false, error: "Global assignment chỉ áp dụng cho toàn môn (không class group / instruction code)." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    if (!classGroupName && !instructionCode) {
      await tx.courseLecturerOverride.upsert({
        where: {
          courseCode_semesterKey_lecturerId: {
            courseCode,
            semesterKey,
            lecturerId,
          },
        },
        create: {
          courseCode,
          semesterKey,
          lecturerId,
          enabled: true,
          updatedBy: session.username,
        },
        update: {
          enabled: true,
          updatedBy: session.username,
        },
      });
    } else {
      await tx.courseTeachingAssignment.upsert({
        where: {
          courseCode_semesterKey_classGroupName_instructionCode_lecturerId: {
            courseCode,
            semesterKey,
            classGroupName,
            instructionCode,
            lecturerId,
          },
        },
        create: {
          courseCode,
          semesterKey,
          classGroupName,
          instructionCode,
          lecturerId,
          enabled: true,
          updatedBy: session.username,
        },
        update: {
          enabled: true,
          updatedBy: session.username,
        },
      });
    }

    if (lecturerName) {
      await tx.lecturerProfile.upsert({
        where: {
          lecturerId,
        },
        create: {
          lecturerId,
          name: lecturerName,
          updatedBy: session.username,
        },
        update: {
          name: lecturerName,
          updatedBy: session.username,
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    scope,
    courseCode,
    semesterKey,
    lecturerId,
    classGroupName: classGroupName || null,
    instructionCode: instructionCode || null,
  });
}

export async function DELETE(request: NextRequest) {
  if (!hasAssignmentDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client is not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await getRequestSession(request);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: CourseLecturerBody;
  try {
    body = (await request.json()) as CourseLecturerBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = await parseCourseAndLecturer(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Invalid course or lecturer." }, { status: 400 });
  }

  if (parsed.scope === "GLOBAL" && (parsed.classGroupName || parsed.instructionCode)) {
    return NextResponse.json(
      { ok: false, error: "Global assignment chỉ áp dụng cho toàn môn (không class group / instruction code)." },
      { status: 400 },
    );
  }

  if (!parsed.classGroupName && !parsed.instructionCode) {
    await prisma.courseLecturerOverride.upsert({
      where: {
        courseCode_semesterKey_lecturerId: {
          courseCode: parsed.courseCode,
          semesterKey: parsed.semesterKey,
          lecturerId: parsed.lecturerId,
        },
      },
      create: {
        courseCode: parsed.courseCode,
        semesterKey: parsed.semesterKey,
        lecturerId: parsed.lecturerId,
        enabled: false,
        updatedBy: session.username,
      },
      update: {
        enabled: false,
        updatedBy: session.username,
      },
    });
  } else {
    await prisma.courseTeachingAssignment.upsert({
      where: {
        courseCode_semesterKey_classGroupName_instructionCode_lecturerId: {
          courseCode: parsed.courseCode,
          semesterKey: parsed.semesterKey,
          classGroupName: parsed.classGroupName,
          instructionCode: parsed.instructionCode,
          lecturerId: parsed.lecturerId,
        },
      },
      create: {
        courseCode: parsed.courseCode,
        semesterKey: parsed.semesterKey,
        classGroupName: parsed.classGroupName,
        instructionCode: parsed.instructionCode,
        lecturerId: parsed.lecturerId,
        enabled: false,
        updatedBy: session.username,
      },
      update: {
        enabled: false,
        updatedBy: session.username,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    scope: parsed.scope,
    courseCode: parsed.courseCode,
    semesterKey: parsed.semesterKey,
    lecturerId: parsed.lecturerId,
    classGroupName: parsed.classGroupName || null,
    instructionCode: parsed.instructionCode || null,
  });
}
