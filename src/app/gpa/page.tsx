import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/session";
import { calculateGpaSummary } from "@/lib/gpa";
import { getPortalMeta } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import {
  compareSemesterKeyDesc,
  GPA_BASELINE_SEMESTERS,
  labelFromSemesterKey,
  type SemesterOption,
} from "@/lib/semester";

import { GpaPanel } from "./gpa-panel";

function hasGpaDelegate(): boolean {
  const db = prisma as unknown as {
    studentGradeEntry?: unknown;
  };

  return Boolean(db.studentGradeEntry);
}

function buildSemesterOptions(
  semesters: Array<{ key: string; label: string }>,
  entrySemesterKeys: string[],
): Array<{ key: string; label: string }> {
  const map = new Map<string, string>();

  for (const semester of GPA_BASELINE_SEMESTERS) {
    map.set(semester.key, semester.label);
  }

  for (const semester of semesters) {
    map.set(semester.key, semester.label);
  }

  for (const key of entrySemesterKeys) {
    if (!map.has(key)) {
      map.set(key, labelFromSemesterKey(key));
    }
  }

  return [...map.entries()]
    .map(([key, label]): SemesterOption => ({ key, label }))
    .sort((a, b) => compareSemesterKeyDesc(a.key, b.key));
}

export default async function GpaPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const [meta, courses] = await Promise.all([
    getPortalMeta(),
    prisma.course.findMany({
      orderBy: {
        code: "asc",
      },
      select: {
        code: true,
        nameEn: true,
        nameVi: true,
        credits: true,
      },
    }),
  ]);

  const isSupported = hasGpaDelegate();
  const entries = isSupported
    ? await prisma.studentGradeEntry.findMany({
        where: {
          username: session.username,
        },
        orderBy: [{ semesterKey: "desc" }, { updatedAt: "desc" }],
      })
    : [];

  const summary = calculateGpaSummary(entries);
  const semesters = buildSemesterOptions(
    meta.semesters.map((semester) => ({ key: semester.key, label: semester.label })),
    entries.map((entry) => entry.semesterKey),
  );

  return (
    <main className="page-shell">
      <section className="hero-block gpa-hero">
        <p className="eyebrow">Student Services · GPA</p>
        <h1>Bảng điểm cá nhân & GPA tích lũy</h1>
        <p>
          Theo dõi GPA theo từng học kỳ và GPA tích lũy (thang 4.0), quản lý học phần đã học, và chuẩn bị kế hoạch học tập
          rõ ràng ngay trên portal.
        </p>
        <div className="chip-row">
          <span className="chip">{entries.length} học phần đã nhập</span>
          <span className="chip">CGPA: {summary.overall.gpa === null ? "N/A" : summary.overall.gpa.toFixed(2)} / 4.00</span>
          <span className="chip">{summary.overall.countedCredits} tín chỉ tính GPA</span>
          <span className="chip">{summary.bySemester.length} học kỳ có dữ liệu</span>
        </div>
      </section>

      {!isSupported ? (
        <section className="warning-card">
          <h2>GPA service chưa sẵn sàng</h2>
          <p>
            Cần sync schema database trước khi dùng: <code>npx prisma generate && npx prisma db push</code>, sau đó
            restart server.
          </p>
        </section>
      ) : (
        <GpaPanel
          username={session.username}
          role={session.role}
          semesters={semesters}
          courses={courses}
          initialEntries={entries.map((entry) => ({
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
          }))}
          initialSummary={summary}
        />
      )}

      <p className="hint-text">
        <Link href="/">Lịch học</Link> · <Link href="/courses">Học phần</Link> · <Link href="/profile">Hồ sơ cá nhân</Link>
      </p>
    </main>
  );
}
