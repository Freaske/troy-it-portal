import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/request-session";
import { normalizeCourseCode } from "@/lib/knowledge";
import { calculateGpaSummary, gradeSpecByLetter, normalizeGradeLetter, normalizeSemesterKey } from "@/lib/gpa";
import { prisma } from "@/lib/prisma";

type GpaBody = {
  id?: unknown;
  semesterKey?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  credits?: unknown;
  gradeLetter?: unknown;
  note?: unknown;
};

function cleanText(value: unknown, maxLength = 220): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeCredits(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const value = Math.trunc(raw);
    return value > 0 && value <= 12 ? value : null;
  }

  const text = cleanText(raw, 20);
  if (!text) {
    return null;
  }

  const value = Number.parseInt(text, 10);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value < 1 || value > 12) {
    return null;
  }

  return value;
}

function hasGpaDelegates(): boolean {
  const db = prisma as unknown as {
    studentGradeEntry?: unknown;
  };

  return Boolean(db.studentGradeEntry);
}

async function loadEntriesForUser(username: string, semesterKey?: string | null) {
  return prisma.studentGradeEntry.findMany({
    where: {
      username,
      ...(semesterKey ? { semesterKey } : {}),
    },
    orderBy: [{ semesterKey: "desc" }, { updatedAt: "desc" }],
  });
}

function formatEntries(
  entries: Array<{
    id: string;
    semesterKey: string;
    courseCode: string;
    courseName: string | null;
    credits: number;
    gradeLetter: string;
    gradePoint: number | null;
    includeInGpa: boolean;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
) {
  return entries.map((entry) => ({
    id: entry.id,
    semesterKey: entry.semesterKey,
    courseCode: entry.courseCode,
    courseName: entry.courseName,
    credits: entry.credits,
    gradeLetter: entry.gradeLetter,
    gradePoint: entry.gradePoint,
    includeInGpa: entry.includeInGpa,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));
}

export async function GET(request: NextRequest) {
  if (!hasGpaDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const semester = normalizeSemesterKey(request.nextUrl.searchParams.get("semester"));
  const entries = await loadEntriesForUser(session.username, semester);
  const summary = calculateGpaSummary(entries);

  return NextResponse.json({
    ok: true,
    entries: formatEntries(entries),
    summary,
  });
}

export async function POST(request: NextRequest) {
  if (!hasGpaDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: GpaBody;
  try {
    body = (await request.json()) as GpaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const semesterKey = normalizeSemesterKey(cleanText(body.semesterKey, 80));
  const courseCode = normalizeCourseCode(cleanText(body.courseCode, 40));
  const gradeLetter = normalizeGradeLetter(cleanText(body.gradeLetter, 10));
  const note = cleanText(body.note, 1000) || null;

  if (!semesterKey || !courseCode || !gradeLetter) {
    return NextResponse.json(
      { ok: false, error: "semesterKey, courseCode, and gradeLetter are required." },
      { status: 400 },
    );
  }

  const gradeSpec = gradeSpecByLetter(gradeLetter);
  if (!gradeSpec) {
    return NextResponse.json({ ok: false, error: "Invalid grade letter." }, { status: 400 });
  }

  const course = await prisma.course.findUnique({
    where: {
      code: courseCode,
    },
    select: {
      nameVi: true,
      nameEn: true,
      credits: true,
    },
  });

  const credits = normalizeCredits(body.credits) ?? (course?.credits ?? null);
  if (!credits) {
    return NextResponse.json(
      { ok: false, error: "Credits are required. Enter credits manually if course has no credits yet." },
      { status: 400 },
    );
  }

  const courseName = cleanText(body.courseName, 220) || course?.nameVi || course?.nameEn || null;

  const row = await prisma.studentGradeEntry.upsert({
    where: {
      username_semesterKey_courseCode: {
        username: session.username,
        semesterKey,
        courseCode,
      },
    },
    create: {
      username: session.username,
      semesterKey,
      courseCode,
      courseName,
      credits,
      gradeLetter: gradeSpec.letter,
      gradePoint: gradeSpec.point,
      includeInGpa: gradeSpec.includeInGpa,
      note,
    },
    update: {
      courseName,
      credits,
      gradeLetter: gradeSpec.letter,
      gradePoint: gradeSpec.point,
      includeInGpa: gradeSpec.includeInGpa,
      note,
    },
  });

  const entries = await loadEntriesForUser(session.username);
  const summary = calculateGpaSummary(entries);

  return NextResponse.json({
    ok: true,
    entry: formatEntries([row])[0],
    summary,
  });
}

export async function PATCH(request: NextRequest) {
  if (!hasGpaDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: GpaBody;
  try {
    body = (await request.json()) as GpaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = cleanText(body.id, 120);
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const current = await prisma.studentGradeEntry.findUnique({
    where: {
      id,
    },
  });

  if (!current || current.username !== session.username) {
    return NextResponse.json({ ok: false, error: "GPA entry not found." }, { status: 404 });
  }

  const semesterKey = body.semesterKey !== undefined ? normalizeSemesterKey(cleanText(body.semesterKey, 80)) : undefined;
  const courseCode = body.courseCode !== undefined ? normalizeCourseCode(cleanText(body.courseCode, 40)) : undefined;
  const gradeLetter = body.gradeLetter !== undefined ? normalizeGradeLetter(cleanText(body.gradeLetter, 10)) : undefined;
  const note = body.note !== undefined ? cleanText(body.note, 1000) || null : undefined;
  const credits = body.credits !== undefined ? normalizeCredits(body.credits) : undefined;
  const courseName = body.courseName !== undefined ? cleanText(body.courseName, 220) || null : undefined;

  if (body.semesterKey !== undefined && !semesterKey) {
    return NextResponse.json({ ok: false, error: "Invalid semesterKey." }, { status: 400 });
  }
  if (body.courseCode !== undefined && !courseCode) {
    return NextResponse.json({ ok: false, error: "Invalid courseCode." }, { status: 400 });
  }
  if (body.gradeLetter !== undefined && !gradeLetter) {
    return NextResponse.json({ ok: false, error: "Invalid gradeLetter." }, { status: 400 });
  }
  if (body.credits !== undefined && !credits) {
    return NextResponse.json({ ok: false, error: "Invalid credits." }, { status: 400 });
  }

  const gradeSpec = gradeLetter ? gradeSpecByLetter(gradeLetter) : null;
  if (gradeLetter && !gradeSpec) {
    return NextResponse.json({ ok: false, error: "Invalid grade spec." }, { status: 400 });
  }

  try {
    const row = await prisma.studentGradeEntry.update({
      where: {
        id,
      },
      data: {
        ...(semesterKey ? { semesterKey } : {}),
        ...(courseCode ? { courseCode } : {}),
        ...(courseName !== undefined ? { courseName } : {}),
        ...(credits ? { credits } : {}),
        ...(gradeSpec
          ? {
              gradeLetter: gradeSpec.letter,
              gradePoint: gradeSpec.point,
              includeInGpa: gradeSpec.includeInGpa,
            }
          : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });

    const entries = await loadEntriesForUser(session.username);
    const summary = calculateGpaSummary(entries);

    return NextResponse.json({
      ok: true,
      entry: formatEntries([row])[0],
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to update GPA entry.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasGpaDelegates()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Database client not ready. Run `npx prisma generate && npx prisma db push`, then restart dev server.",
      },
      { status: 503 },
    );
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let id = cleanText(request.nextUrl.searchParams.get("id"), 120);

  if (!id) {
    try {
      const body = (await request.json()) as GpaBody;
      id = cleanText(body.id, 120);
    } catch {
      id = "";
    }
  }

  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const deleted = await prisma.studentGradeEntry.deleteMany({
    where: {
      id,
      username: session.username,
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ ok: false, error: "GPA entry not found." }, { status: 404 });
  }

  const entries = await loadEntriesForUser(session.username);
  const summary = calculateGpaSummary(entries);

  return NextResponse.json({
    ok: true,
    summary,
  });
}
