import { DayOfWeek } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getPortalData } from "@/lib/portal";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dayValue = searchParams.get("day") ?? "ALL";

  const data = await getPortalData({
    semesterKey: searchParams.get("semester") ?? undefined,
    cohortCode: searchParams.get("cohort") ?? undefined,
    classGroupName: searchParams.get("classGroup") ?? undefined,
    day:
      dayValue === "ALL" || Object.values(DayOfWeek).includes(dayValue as DayOfWeek)
        ? (dayValue as DayOfWeek | "ALL")
        : "ALL",
  });

  return NextResponse.json(data);
}
