import Link from "next/link";
import { notFound } from "next/navigation";

import { getAcademicBundle } from "@/lib/academic-data";
import { getServerSession } from "@/lib/auth/session";
import { getPortalMeta } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

import { LecturerAdminForm } from "./lecturer-admin-form";
import { LecturerCoursesAdminForm } from "./lecturer-courses-admin-form";

type LecturerDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN");
}

async function getEffectiveLecturerCoursesForSemester(input: {
  lecturerId: string;
  semesterKey: string | null;
  baseCourseCodes: string[];
}): Promise<string[]> {
  const courseSet = new Set(input.baseCourseCodes);
  if (!input.semesterKey) {
    return [...courseSet].sort((a, b) => a.localeCompare(b));
  }

  const db = prisma as unknown as {
    courseLecturerOverride?: {
      findMany?: (args: unknown) => Promise<Array<{ courseCode: string; enabled: boolean }>>;
    };
    courseTeachingAssignment?: {
      findMany?: (args: unknown) => Promise<Array<{ courseCode: string }>>;
    };
  };

  const semesterKey = input.semesterKey
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_");

  const [overrides, assignments] = await Promise.all([
    db.courseLecturerOverride?.findMany
      ? db.courseLecturerOverride.findMany({
          where: {
            lecturerId: input.lecturerId,
            semesterKey,
          },
          select: {
            courseCode: true,
            enabled: true,
          },
        })
      : Promise.resolve([]),
    db.courseTeachingAssignment?.findMany
      ? db.courseTeachingAssignment
          .findMany({
            where: {
              lecturerId: input.lecturerId,
              semesterKey,
              enabled: true,
            },
            select: {
              courseCode: true,
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const row of overrides) {
    if (row.enabled) {
      courseSet.add(row.courseCode);
    } else {
      courseSet.delete(row.courseCode);
    }
  }

  for (const row of assignments) {
    courseSet.add(row.courseCode);
  }

  return [...courseSet].sort((a, b) => a.localeCompare(b));
}

export default async function LecturerDetailPage({ params, searchParams }: LecturerDetailProps) {
  const [routeParams, query] = await Promise.all([params, searchParams]);
  const requestedSemester = pickSingle(query.semester);
  const [bundle, portalMeta] = await Promise.all([getAcademicBundle(), getPortalMeta()]);
  const selectedSemester =
    portalMeta.semesters.find((semester) => semester.key === requestedSemester) ?? portalMeta.semesters[0] ?? null;
  const selectedSemesterKey = selectedSemester?.key ?? "";

  const lecturer = bundle.lecturers.find((item) => item.id === routeParams.id);
  if (!lecturer) {
    notFound();
  }

  const effectiveCourseCodes = await getEffectiveLecturerCoursesForSemester({
    lecturerId: lecturer.id,
    semesterKey: selectedSemesterKey || null,
    baseCourseCodes: lecturer.courses,
  });

  const reviews = bundle.courses
    .flatMap((course) => course.reviews)
    .filter((review) => review.lecturerId === lecturer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const session = await getServerSession();

  return (
    <main className="page-shell">
      <section className="hero-block">
        {lecturer.avatarUrl ? (
          <div className="lecturer-hero-avatar">
            <img src={lecturer.avatarUrl} alt={`Ảnh giảng viên ${lecturer.name}`} />
          </div>
        ) : (
          <div className="lecturer-hero-avatar">
            <span>{lecturer.name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <p className="eyebrow">Chi Tiết Giảng Viên</p>
        <h1>{lecturer.name}</h1>
        <p>
          {lecturer.title ? `${lecturer.title} · ` : ""}
          {lecturer.department ?? "Chưa có khoa/viện"} · Điểm trung bình:{" "}
          {lecturer.averageRating === null ? "N/A" : `${lecturer.averageRating.toFixed(2)} / 5`} · Số review:{" "}
          {lecturer.reviewCount}
        </p>
      </section>

      <section className="details-grid">
        <article className="details-card">
          <h2>Thông tin liên hệ</h2>
          <p>
            <strong>Email:</strong> {lecturer.email ?? "N/A"}
          </p>
          <p>
            <strong>Phòng làm việc:</strong> {lecturer.office ?? "N/A"}
          </p>
          <p>
            <strong>Khoa/Viện:</strong> {lecturer.department ?? "N/A"}
          </p>
          <p>
            <strong>Học hàm/Học vị:</strong> {lecturer.title ?? "N/A"}
          </p>
          {lecturer.profileUrl ? (
            <p>
              <strong>Hồ sơ:</strong>{" "}
              <a href={lecturer.profileUrl} target="_blank" rel="noreferrer">
                {lecturer.profileUrl}
              </a>
            </p>
          ) : null}
        </article>

        <article className="details-card">
          <h2>Môn giảng dạy</h2>
          {effectiveCourseCodes.length === 0 ? (
            <p className="muted-small">
              Chưa có học phần được gán cho giảng viên này trong học kỳ {selectedSemester?.label ?? "đang chọn"}.
            </p>
          ) : (
            <div className="chip-row">
              {effectiveCourseCodes.map((courseCode) => (
                <Link
                  key={courseCode}
                  href={`/courses/${encodeURIComponent(courseCode)}${selectedSemesterKey ? `?semester=${encodeURIComponent(selectedSemesterKey)}` : ""}`}
                  className="chip link-chip"
                >
                  {courseCode}
                </Link>
              ))}
            </div>
          )}
          {lecturer.bio ? <p className="hint-text">{lecturer.bio}</p> : null}
        </article>
      </section>

      <section className="details-card mt-card">
        <h2>Học kỳ áp dụng</h2>
        {portalMeta.semesters.length > 0 ? (
          <form method="GET" className="admin-form-grid">
            <label className="admin-form-full">
              Chọn học kỳ để quản lý phân công
              <select name="semester" defaultValue={selectedSemesterKey}>
                {portalMeta.semesters.map((semester) => (
                  <option key={semester.key} value={semester.key}>
                    {semester.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-form-actions">
              <button type="submit" className="button-primary">
                Áp dụng học kỳ
              </button>
            </div>
          </form>
        ) : (
          <p>Chưa có dữ liệu học kỳ.</p>
        )}
      </section>

      {session?.role === "ADMIN" ? (
        <section className="details-card mt-card">
          <h2>Admin chỉnh sửa hồ sơ giảng viên</h2>
          <p className="muted-small">
            Các thông tin dưới đây sẽ override dữ liệu parse từ resources (không sửa file gốc).
          </p>
          <LecturerAdminForm
            lecturerId={lecturer.id}
            initial={{
              name: lecturer.name,
              avatarUrl: lecturer.avatarUrl ?? "",
              title: lecturer.title ?? "",
              department: lecturer.department ?? "",
              email: lecturer.email ?? "",
              office: lecturer.office ?? "",
              profileUrl: lecturer.profileUrl ?? "",
              bio: lecturer.bio ?? "",
            }}
          />
        </section>
      ) : null}

      {session?.role === "ADMIN" ? (
        <section className="details-card mt-card">
          <h2>Admin chỉnh sửa môn giảng dạy</h2>
          <p className="muted-small">
            Có thể gán môn theo học kỳ đang chọn hoặc đặt mặc định cho mọi kỳ. Student vẫn xem được đầy đủ danh sách môn
            giảng dạy.
          </p>
          <LecturerCoursesAdminForm
            lecturerId={lecturer.id}
            lecturerName={lecturer.name}
            semesterKey={selectedSemesterKey}
            semesterLabel={selectedSemester?.label ?? selectedSemesterKey}
            currentCourseCodes={effectiveCourseCodes}
            globalCourseCodes={lecturer.courses}
            allCourses={bundle.courses.map((course) => ({
              code: course.code,
              nameEn: course.nameEn,
              nameVi: course.nameVi,
            }))}
          />
        </section>
      ) : null}

      <section className="details-card mt-card">
        <h2>Nhận xét và đánh giá ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p>Chưa có nhận xét gắn với giảng viên này.</p>
        ) : (
          <ul className="review-list">
            {reviews.map((review) => (
              <li key={review.id} className={`review-item sentiment-${review.sentiment}`}>
                <div className="line-spread">
                  <strong>
                    <Link
                      href={`/courses/${encodeURIComponent(review.courseCode)}${selectedSemesterKey ? `?semester=${encodeURIComponent(selectedSemesterKey)}` : ""}`}
                    >
                      {review.courseCode}
                    </Link>
                  </strong>
                  <span>{review.rating === null ? "N/A" : `${review.rating} / 5`}</span>
                </div>
                <p>{review.content}</p>
                <span className="muted-small">
                  {review.sourceType === "student"
                    ? `Review sinh viên · ${formatDate(review.createdAt)}`
                    : "Dữ liệu seed từ guide.md"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="hint-text">
        <Link href="/lecturers">Quay lại danh sách giảng viên</Link> · <Link href="/courses">Học phần</Link>
      </p>
    </main>
  );
}
