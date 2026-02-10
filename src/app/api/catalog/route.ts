import { NextRequest, NextResponse } from "next/server";

import { getAcademicBundle } from "@/lib/academic-data";
import { normalizeCourseCode, normalizeSearchText } from "@/lib/knowledge";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const data = await getAcademicBundle();

  const normalizedQ = normalizeSearchText(q);
  const normalizedCode = normalizeCourseCode(q);

  const courses = data.courses
    .filter((course) => {
      if (!q) {
        return true;
      }

      if (normalizedCode && course.code === normalizedCode) {
        return true;
      }

      return (
        normalizeSearchText(course.code).includes(normalizedQ) ||
        normalizeSearchText(course.nameEn ?? "").includes(normalizedQ) ||
        normalizeSearchText(course.nameVi ?? "").includes(normalizedQ) ||
        normalizeSearchText(course.program ?? "").includes(normalizedQ)
      );
    })
    .slice(0, 200);

  return NextResponse.json({
    generatedAt: data.generatedAt,
    stats: data.stats,
    count: courses.length,
    courses,
  });
}
