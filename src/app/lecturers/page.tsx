import Link from "next/link";

import { getAcademicBundle } from "@/lib/academic-data";
import { normalizeSearchText } from "@/lib/knowledge";
import { getPortalMeta } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

type LecturersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeSemesterKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");

  return cleaned || null;
}

async function buildLecturerCoursesBySemester(input: {
  semesterKey: string | null;
  baseCoursesByLecturer: Array<{ lecturerId: string; courseCodes: string[] }>;
}): Promise<Map<string, string[]>> {
  const byLecturer = new Map<string, Set<string>>();
  for (const row of input.baseCoursesByLecturer) {
    byLecturer.set(row.lecturerId, new Set(row.courseCodes));
  }

  if (!input.semesterKey) {
    return new Map(
      [...byLecturer.entries()].map(([lecturerId, courseSet]) => [
        lecturerId,
        [...courseSet].sort((a, b) => a.localeCompare(b)),
      ]),
    );
  }

  const normalizedSemester = normalizeSemesterKey(input.semesterKey);
  if (!normalizedSemester) {
    return new Map(
      [...byLecturer.entries()].map(([lecturerId, courseSet]) => [
        lecturerId,
        [...courseSet].sort((a, b) => a.localeCompare(b)),
      ]),
    );
  }

  const db = prisma as unknown as {
    courseLecturerOverride?: {
      findMany?: (args: unknown) => Promise<Array<{ courseCode: string; lecturerId: string; enabled: boolean }>>;
    };
    courseTeachingAssignment?: {
      findMany?: (args: unknown) => Promise<Array<{ courseCode: string; lecturerId: string }>>;
    };
  };

  const [overrides, assignments] = await Promise.all([
    db.courseLecturerOverride?.findMany
      ? db.courseLecturerOverride
          .findMany({
            where: {
              semesterKey: normalizedSemester,
            },
            select: {
              courseCode: true,
              lecturerId: true,
              enabled: true,
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    db.courseTeachingAssignment?.findMany
      ? db.courseTeachingAssignment
          .findMany({
            where: {
              semesterKey: normalizedSemester,
              enabled: true,
            },
            select: {
              courseCode: true,
              lecturerId: true,
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const row of overrides) {
    const currentSet = byLecturer.get(row.lecturerId) ?? new Set<string>();
    if (row.enabled) {
      currentSet.add(row.courseCode);
    } else {
      currentSet.delete(row.courseCode);
    }
    byLecturer.set(row.lecturerId, currentSet);
  }

  for (const row of assignments) {
    const currentSet = byLecturer.get(row.lecturerId) ?? new Set<string>();
    currentSet.add(row.courseCode);
    byLecturer.set(row.lecturerId, currentSet);
  }

  return new Map(
    [...byLecturer.entries()].map(([lecturerId, courseSet]) => [
      lecturerId,
      [...courseSet].sort((a, b) => a.localeCompare(b)),
    ]),
  );
}

export default async function LecturersPage({ searchParams }: LecturersPageProps) {
  const query = await searchParams;
  const keyword = normalizeSearchText(single(query.q).trim());
  const requestedSemester = single(query.semester);

  const [data, portalMeta] = await Promise.all([getAcademicBundle(), getPortalMeta()]);
  const selectedSemester =
    portalMeta.semesters.find((semester) => semester.key === requestedSemester) ?? portalMeta.semesters[0] ?? null;
  const selectedSemesterKey = selectedSemester?.key ?? "";

  const lecturerCourseMap = await buildLecturerCoursesBySemester({
    semesterKey: selectedSemesterKey || null,
    baseCoursesByLecturer: data.lecturers.map((lecturer) => ({
      lecturerId: lecturer.id,
      courseCodes: lecturer.courses,
    })),
  });

  const lecturers = data.lecturers
    .map((lecturer) => ({
      ...lecturer,
      courses: lecturerCourseMap.get(lecturer.id) ?? lecturer.courses,
    }))
    .filter((lecturer) => {
      if (!keyword) {
        return true;
      }

      return (
        normalizeSearchText(lecturer.name).includes(keyword) ||
        normalizeSearchText(lecturer.department ?? "").includes(keyword) ||
        lecturer.courses.some((courseCode) => normalizeSearchText(courseCode).includes(keyword))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="page-shell">
      <section className="hero-block faculty-hero">
        <p className="eyebrow">Giảng Viên</p>
        <h1>Faculty Directory</h1>
        <p>
          Danh sách giảng viên theo học kỳ đang chọn, gồm thông tin liên hệ, môn giảng dạy, đánh giá và review sinh viên.
        </p>
        <div className="chip-row">
          <span className="chip">Semester: {selectedSemester?.label ?? "N/A"}</span>
          <span className="chip">{lecturers.length} giảng viên</span>
        </div>
      </section>

      <section className="controls-card">
        <form className="faculty-filter-form" method="GET">
          <label>
            Học kỳ áp dụng
            <select name="semester" defaultValue={selectedSemesterKey}>
              {portalMeta.semesters.map((semester) => (
                <option key={semester.key} value={semester.key}>
                  {semester.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tìm kiếm
            <input name="q" defaultValue={single(query.q)} placeholder="Tên giảng viên, khoa/viện, mã môn..." />
          </label>

          <button type="submit" className="button-primary">
            Áp dụng
          </button>
        </form>
        <p className="hint-text">
          Lưu ý: thay đổi phân công ở tab giảng viên sẽ phản ánh tại đây theo đúng học kỳ đã chọn.
        </p>
      </section>

      <section className="faculty-grid-simple">
        {lecturers.map((lecturer) => (
          <article className="faculty-card-simple" key={lecturer.id}>
            <div className="faculty-card-simple-head">
              <div className="lecturer-inline-avatar">
                {lecturer.avatarUrl ? (
                  <img src={lecturer.avatarUrl} alt={`Ảnh giảng viên ${lecturer.name}`} />
                ) : (
                  <span>{lecturer.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong>{lecturer.name}</strong>
                <p className="muted-small">
                  {lecturer.title ? `${lecturer.title} · ` : ""}
                  {lecturer.department ?? "Chưa có khoa/viện"}
                </p>
              </div>
            </div>

            <div className="chip-row">
              <span className="chip">
                {lecturer.averageRating === null ? "Chưa có điểm" : `${lecturer.averageRating.toFixed(2)} / 5`}
              </span>
              <span className="chip">{lecturer.reviewCount} reviews</span>
              <span className="chip">{lecturer.courses.length} môn</span>
            </div>

            <p className="muted-small">
              Môn giảng dạy:{" "}
              {lecturer.courses.length > 0
                ? lecturer.courses.slice(0, 4).join(", ") + (lecturer.courses.length > 4 ? ` +${lecturer.courses.length - 4}` : "")
                : "Chưa phân công"}
            </p>

            <Link
              href={`/lecturers/${lecturer.id}${selectedSemesterKey ? `?semester=${encodeURIComponent(selectedSemesterKey)}` : ""}`}
              className="button-secondary link-btn"
            >
              Xem hồ sơ
            </Link>
          </article>
        ))}
      </section>

      {lecturers.length === 0 ? <p className="details-card">Không tìm thấy giảng viên phù hợp.</p> : null}

      <p className="hint-text">
        <Link href="/">Lịch học</Link> · <Link href="/courses">Học phần</Link> · <Link href="/resources">Học liệu</Link>
      </p>
    </main>
  );
}
