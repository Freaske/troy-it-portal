import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import { AcademicAdminPanel } from "./academic-admin-panel";

type AcademicAdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function formatDateLabel(raw: Date | null): string {
  if (!raw) {
    return "N/A";
  }

  return raw.toISOString().slice(0, 10);
}

export default async function AcademicAdminPage({ searchParams }: AcademicAdminPageProps) {
  const session = await getServerSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/?denied=admin");
  }

  const query = await searchParams;
  const requestedSemesterKey = pickSingle(query.semester);
  const requestedCohortCode = pickSingle(query.cohort);
  const requestedClassGroupName = pickSingle(query.classGroup);

  const [semesters, courses] = await Promise.all([
    prisma.semester.findMany({
      orderBy: [{ startDate: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        key: true,
        label: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            cohorts: true,
            entries: true,
          },
        },
        cohorts: {
          orderBy: {
            code: "asc",
          },
          select: {
            id: true,
            code: true,
            _count: {
              select: {
                classGroups: true,
              },
            },
            classGroups: {
              orderBy: {
                name: "asc",
              },
              select: {
                id: true,
                name: true,
                _count: {
                  select: {
                    entries: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.course.findMany({
      orderBy: {
        code: "asc",
      },
      select: {
        code: true,
        nameEn: true,
        nameVi: true,
      },
      take: 5000,
    }),
  ]);

  const selectedSemester = semesters.find((semester) => semester.key === requestedSemesterKey) ?? semesters[0] ?? null;
  const selectedCohort =
    selectedSemester?.cohorts.find((cohort) => cohort.code === requestedCohortCode) ??
    selectedSemester?.cohorts[0] ??
    null;
  const selectedClassGroup =
    selectedCohort?.classGroups.find((classGroup) => classGroup.name === requestedClassGroupName) ??
    selectedCohort?.classGroups[0] ??
    null;

  const entries =
    selectedSemester && selectedClassGroup
      ? await prisma.scheduleEntry.findMany({
          where: {
            semesterId: selectedSemester.id,
            classGroupId: selectedClassGroup.id,
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
          take: 600,
        })
      : [];

  entries.sort((a, b) => {
    const dayDelta = DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek);
    if (dayDelta !== 0) {
      return dayDelta;
    }

    const timeA = a.startTime ?? "99:99";
    const timeB = b.startTime ?? "99:99";
    const timeDelta = timeA.localeCompare(timeB);
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return a.course.code.localeCompare(b.course.code);
  });

  const selectedSemesterDateRange = selectedSemester
    ? `${formatDateLabel(selectedSemester.startDate)} → ${formatDateLabel(selectedSemester.endDate)}`
    : "N/A";

  return (
    <main className="page-shell">
      <section className="hero-block admin-academic-hero">
        <p className="eyebrow">Administration Console</p>
        <h1>Academic Structure & Timetable Control Center</h1>
        <p>
          Luồng chuẩn: chọn scope học kỳ/cohort/class trước, sau đó vào chỉnh structure hoặc timetable trong đúng phạm
          vi. Toàn bộ thay đổi được ghi trực tiếp vào database đang chạy.
        </p>

        <div className="admin-flow-grid">
          <article className="admin-flow-card">
            <small>Step 1</small>
            <strong>Chọn đúng phạm vi</strong>
            <p>Semester, Cohort, Class Group.</p>
          </article>
          <article className="admin-flow-card">
            <small>Step 2</small>
            <strong>Quản lý cấu trúc</strong>
            <p>Thêm/sửa/xóa semester, cohort, class group.</p>
          </article>
          <article className="admin-flow-card">
            <small>Step 3</small>
            <strong>Điều phối lịch học</strong>
            <p>Thêm/sửa/xóa slot môn học theo lớp cụ thể.</p>
          </article>
        </div>

        <div className="chip-row">
          <span className="chip">{semesters.length} semesters</span>
          <span className="chip">{courses.length} courses</span>
          <Link href="/" className="chip link-chip">
            Back to Dashboard
          </Link>
          <Link href="/admin/import" className="chip link-chip">
            Open Import Tool
          </Link>
        </div>
      </section>

      <section className="details-card admin-scope-card">
        <header className="admin-section-heading">
          <h2>Step 1 · Scope Selector</h2>
          <p className="muted-small">Scope đang chọn sẽ áp dụng cho toàn bộ thao tác ở phần dưới.</p>
        </header>

        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <small>Selected Semester</small>
            <strong>{selectedSemester?.label ?? "N/A"}</strong>
            <span>{selectedSemesterDateRange}</span>
          </article>
          <article className="admin-kpi-card">
            <small>Cohorts In Semester</small>
            <strong>{selectedSemester?.cohorts.length ?? 0}</strong>
            <span>Đang chọn: {selectedCohort?.code ?? "N/A"}</span>
          </article>
          <article className="admin-kpi-card">
            <small>Class Groups In Cohort</small>
            <strong>{selectedCohort?.classGroups.length ?? 0}</strong>
            <span>Đang chọn: {selectedClassGroup?.name ?? "N/A"}</span>
          </article>
          <article className="admin-kpi-card">
            <small>Scope Slots</small>
            <strong>{entries.length}</strong>
            <span>Có thể chỉnh ngay</span>
          </article>
        </div>

        <form method="GET" className="admin-form-grid admin-scope-form">
          <label>
            Semester
            <select name="semester" defaultValue={selectedSemester?.key ?? ""}>
              {semesters.map((semester) => (
                <option key={semester.key} value={semester.key}>
                  {semester.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cohort
            <select name="cohort" defaultValue={selectedCohort?.code ?? ""}>
              {(selectedSemester?.cohorts ?? []).map((cohort) => (
                <option key={cohort.code} value={cohort.code}>
                  {cohort.code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Class Group
            <select name="classGroup" defaultValue={selectedClassGroup?.name ?? ""}>
              {(selectedCohort?.classGroups ?? []).map((classGroup) => (
                <option key={classGroup.name} value={classGroup.name}>
                  {classGroup.name}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-form-actions">
            <button type="submit" className="button-primary">
              Apply Scope
            </button>
          </div>
        </form>
      </section>

      <AcademicAdminPanel
        selectedSemesterKey={selectedSemester?.key ?? null}
        selectedCohortCode={selectedCohort?.code ?? null}
        selectedClassGroupName={selectedClassGroup?.name ?? null}
        semesters={semesters.map((semester) => ({
          key: semester.key,
          label: semester.label,
          startDate: semester.startDate ? semester.startDate.toISOString().slice(0, 10) : null,
          endDate: semester.endDate ? semester.endDate.toISOString().slice(0, 10) : null,
          cohortCount: semester._count.cohorts,
          classGroupCount: semester.cohorts.reduce((sum, cohort) => sum + cohort._count.classGroups, 0),
          entryCount: semester._count.entries,
        }))}
        cohorts={(selectedSemester?.cohorts ?? []).map((cohort) => ({
          code: cohort.code,
          classGroupCount: cohort._count.classGroups,
        }))}
        classGroups={(selectedCohort?.classGroups ?? []).map((classGroup) => ({
          name: classGroup.name,
          entryCount: classGroup._count.entries,
        }))}
        courses={courses}
        entries={entries.map((entry) => ({
          id: entry.id,
          courseCode: entry.course.code,
          courseNameEn: entry.course.nameEn,
          courseNameVi: entry.course.nameVi,
          dayOfWeek: entry.dayOfWeek,
          session: entry.session,
          startTime: entry.startTime,
          room: entry.room,
          rawTime: entry.rawTime,
          sourceSheet: entry.sourceSheet,
          sourceRow: entry.sourceRow,
        }))}
      />

      <p className="hint-text">
        Back to <Link href="/">dashboard timetable</Link> or continue with <Link href="/admin/import">excel import</Link>.
      </p>
    </main>
  );
}
