import Link from "next/link";

import { getAcademicBundle } from "@/lib/academic-data";
import { normalizeSearchText } from "@/lib/knowledge";

type CoursesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const query = await searchParams;
  const keyword = normalizeSearchText(pickSingle(query.q).trim());

  const data = await getAcademicBundle();
  const courses = data.courses.filter((course) => {
    if (!keyword) {
      return true;
    }

    return (
      normalizeSearchText(course.code).includes(keyword) ||
      normalizeSearchText(course.nameEn ?? "").includes(keyword) ||
      normalizeSearchText(course.nameVi ?? "").includes(keyword) ||
      normalizeSearchText(course.program ?? "").includes(keyword) ||
      normalizeSearchText(course.section ?? "").includes(keyword)
    );
  });

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">Danh Mục Học Phần</p>
        <h1>Danh mục môn học và học liệu</h1>
        <p>
          Dữ liệu tổng hợp từ catalog và thư mục resources, kèm override thông tin giảng viên và review sinh viên.
          Hiện có {data.stats.courses} môn, {data.stats.lecturers} giảng viên, {data.stats.reviews} review.
        </p>
      </section>

      <section className="controls-card">
        <form className="search-form" method="GET">
          <input
            name="q"
            defaultValue={pickSingle(query.q)}
            placeholder="Tìm theo mã môn, tên môn, program, section..."
          />
          <button type="submit" className="button-primary">
            Tìm kiếm
          </button>
        </form>
        <p className="hint-text">
          <Link href="/">Lịch học</Link> · <Link href="/lecturers">Giảng viên</Link> ·{" "}
          <Link href="/resources">Kho học liệu</Link>
        </p>
      </section>

      <section className="course-grid">
        {courses.map((course) => (
          <article className="course-card" key={course.code}>
            <div className="course-top">
              <strong>{course.code}</strong>
              <span>{course.credits ? `${course.credits} tín chỉ` : "Chưa có tín chỉ"}</span>
            </div>
            <h3>{course.nameEn ?? "Chưa có tên môn (English)"}</h3>
            {course.nameVi ? <p>{course.nameVi}</p> : null}
            <p className="muted-small">{course.program ?? "Chưa có program"}</p>
            <p className="muted-small">{course.section ?? "Chưa có section"}</p>

            <div className="chip-row">
              <span className="chip">{course.resources.length} files</span>
              <span className="chip">{course.lecturers.length} lecturers</span>
              <span className="chip">{course.reviews.length} reviews</span>
              <span className="chip">
                {course.averageRating === null ? "Chưa có điểm" : `TB ${course.averageRating.toFixed(2)}/5`}
              </span>
            </div>

            <Link href={`/courses/${encodeURIComponent(course.code)}`} className="button-secondary link-btn">
              Xem chi tiết
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
