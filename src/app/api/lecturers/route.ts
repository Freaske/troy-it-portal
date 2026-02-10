import { NextRequest, NextResponse } from "next/server";

import { getAcademicBundle } from "@/lib/academic-data";
import { normalizeSearchText } from "@/lib/knowledge";

export async function GET(request: NextRequest) {
  const q = normalizeSearchText(request.nextUrl.searchParams.get("q")?.trim() ?? "");
  const includeReviews = request.nextUrl.searchParams.get("includeReviews") === "1";

  const data = await getAcademicBundle();
  const reviews = includeReviews ? data.courses.flatMap((course) => course.reviews) : [];

  const lecturers = data.lecturers.filter((lecturer) => {
    if (!q) {
      return true;
    }

    return (
      normalizeSearchText(lecturer.name).includes(q) ||
      lecturer.courses.some((courseCode) => normalizeSearchText(courseCode).includes(q))
    );
  });

  return NextResponse.json({
    generatedAt: data.generatedAt,
    count: lecturers.length,
    lecturers: lecturers.map((lecturer) => ({
      ...lecturer,
      reviews: includeReviews ? reviews.filter((review) => review.lecturerId === lecturer.id) : undefined,
    })),
  });
}
