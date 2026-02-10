import { NextRequest, NextResponse } from "next/server";

import { getAcademicBundle } from "@/lib/academic-data";
import { getRequestSession } from "@/lib/auth/request-session";
import { normalizeCourseCode } from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";

type ReviewBody = {
  courseCode?: unknown;
  lecturerId?: unknown;
  rating?: unknown;
  content?: unknown;
};

function cleanText(value: unknown, maxLength = 2000): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function parseRating(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 1 && value <= 5) {
      return value;
    }
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 5) {
      return parsed;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const courseCode = normalizeCourseCode(request.nextUrl.searchParams.get("course") ?? "");
  const lecturerId = cleanText(request.nextUrl.searchParams.get("lecturerId"), 120) || null;

  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);
  const take = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;

  const reviews = await prisma.studentReview.findMany({
    where: {
      ...(courseCode ? { courseCode } : {}),
      ...(lecturerId ? { lecturerId } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take,
  });

  return NextResponse.json({
    ok: true,
    count: reviews.length,
    reviews,
  });
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "STUDENT") {
    return NextResponse.json({ ok: false, error: "Only STUDENT can submit reviews." }, { status: 403 });
  }

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const courseCode = normalizeCourseCode(cleanText(body.courseCode, 40));
  if (!courseCode) {
    return NextResponse.json({ ok: false, error: "Invalid course code" }, { status: 400 });
  }

  const rating = parseRating(body.rating);
  if (!rating) {
    return NextResponse.json({ ok: false, error: "Rating must be an integer from 1 to 5" }, { status: 400 });
  }

  const content = cleanText(body.content, 2400);
  if (content.length < 12) {
    return NextResponse.json({ ok: false, error: "Review content must be at least 12 characters" }, { status: 400 });
  }

  const lecturerId = cleanText(body.lecturerId, 120) || null;

  const bundle = await getAcademicBundle();
  const course = bundle.courses.find((item) => item.code === courseCode);
  if (!course) {
    return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });
  }

  if (lecturerId) {
    const lecturerExists = bundle.lecturers.some((lecturer) => lecturer.id === lecturerId);
    if (!lecturerExists) {
      return NextResponse.json({ ok: false, error: "Lecturer not found" }, { status: 404 });
    }
  }

  const created = await prisma.studentReview.create({
    data: {
      courseCode,
      lecturerId,
      authorUsername: session.username,
      authorName: session.name,
      authorRole: session.role,
      rating,
      content,
    },
  });

  return NextResponse.json({
    ok: true,
    review: created,
  });
}
