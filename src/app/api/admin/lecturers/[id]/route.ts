import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/request-session";
import { getEnhancedLecturerById } from "@/lib/academic-data";
import { prisma } from "@/lib/prisma";

type LecturerPatchBody = {
  name?: unknown;
  avatarUrl?: unknown;
  title?: unknown;
  department?: unknown;
  email?: unknown;
  office?: unknown;
  profileUrl?: unknown;
  bio?: unknown;
};

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function cleanProfileUrl(value: unknown): string | null {
  const cleaned = cleanText(value, 800);
  if (!cleaned) {
    return null;
  }

  if (!/^https?:\/\//i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function cleanAvatarUrl(value: unknown): string | null {
  const cleaned = cleanText(value, 800);
  if (!cleaned) {
    return null;
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  if (/^\/uploads\/lecturers\//i.test(cleaned)) {
    return cleaned;
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const lecturer = await getEnhancedLecturerById(params.id);

  if (!lecturer) {
    return NextResponse.json({ ok: false, error: "Lecturer not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, lecturer });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const params = await context.params;
  const lecturerId = params.id.trim();

  if (!lecturerId) {
    return NextResponse.json({ ok: false, error: "Invalid lecturer id" }, { status: 400 });
  }

  let body: LecturerPatchBody;
  try {
    body = (await request.json()) as LecturerPatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = {
    name: cleanText(body.name, 120),
    avatarUrl: cleanAvatarUrl(body.avatarUrl),
    title: cleanText(body.title, 180),
    department: cleanText(body.department, 180),
    email: cleanText(body.email, 180),
    office: cleanText(body.office, 180),
    profileUrl: cleanProfileUrl(body.profileUrl),
    bio: cleanText(body.bio, 2500),
  };

  await prisma.lecturerProfile.upsert({
    where: {
      lecturerId,
    },
    create: {
      lecturerId,
      ...payload,
      updatedBy: session.username,
    },
    update: {
      ...payload,
      updatedBy: session.username,
    },
  });

  const lecturer = await getEnhancedLecturerById(lecturerId);

  return NextResponse.json({
    ok: true,
    lecturer,
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const params = await context.params;
  const lecturerId = params.id.trim();

  if (!lecturerId) {
    return NextResponse.json({ ok: false, error: "Invalid lecturer id" }, { status: 400 });
  }

  const existing = await getEnhancedLecturerById(lecturerId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Lecturer not found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const [teachingAssignments, overrides, reviews, profile] = await Promise.all([
      tx.courseTeachingAssignment.deleteMany({
        where: {
          lecturerId,
        },
      }),
      tx.courseLecturerOverride.deleteMany({
        where: {
          lecturerId,
        },
      }),
      tx.studentReview.updateMany({
        where: {
          lecturerId,
        },
        data: {
          lecturerId: null,
        },
      }),
      tx.lecturerProfile.deleteMany({
        where: {
          lecturerId,
        },
      }),
    ]);

    return {
      deletedTeachingAssignments: teachingAssignments.count,
      deletedCourseOverrides: overrides.count,
      unlinkedReviews: reviews.count,
      deletedProfiles: profile.count,
    };
  });

  const stillVisible = await getEnhancedLecturerById(lecturerId);

  return NextResponse.json({
    ok: true,
    lecturerId,
    ...result,
    stillVisibleFromSeed: Boolean(stillVisible),
  });
}
