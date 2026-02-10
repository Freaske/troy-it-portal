import Link from "next/link";
import { notFound } from "next/navigation";

import { getAcademicBundle, getCourseTeachingAssignments } from "@/lib/academic-data";
import { getServerSession } from "@/lib/auth/session";
import { normalizeCourseCode } from "@/lib/knowledge";
import { getPortalMeta } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

import { CourseLecturerAdminForm } from "./course-lecturer-admin-form";
import { StudentReviewForm } from "./student-review-form";

type CourseDetailProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function formatReviewMeta(createdAt: string, sourceType: "seed" | "student", authorName: string | null): string {
  if (sourceType === "seed") {
    return "Dữ liệu seed từ guide.md";
  }

  const date = new Date(createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString("vi-VN");
  return `Gửi bởi ${authorName ?? "sinh viên"} · ${dateLabel}`;
}

function extractInstructionCode(value: string | null | undefined): string | null {
  const text = (value ?? "").toUpperCase();
  const matched = text.match(/\bIHA[A-Z0-9]{1,4}\b/);
  if (!matched) {
    return null;
  }

  return matched[0]
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export default async function CourseDetailPage({ params, searchParams }: CourseDetailProps) {
  const [routeParams, query] = await Promise.all([params, searchParams]);
  const requestedSemester = pickSingle(query.semester);
  const courseCode = normalizeCourseCode(decodeURIComponent(routeParams.code));
  if (!courseCode) {
    notFound();
  }
  const [bundle, portalMeta] = await Promise.all([getAcademicBundle(), getPortalMeta()]);
  const course = bundle.courses.find((item) => item.code === courseCode);

  if (!course) {
    notFound();
  }

  const selectedSemester =
    portalMeta.semesters.find((semester) => semester.key === requestedSemester) ?? portalMeta.semesters[0] ?? null;
  const selectedSemesterKey = selectedSemester?.key ?? null;
  const selectedSemesterLabel = selectedSemester?.label ?? selectedSemester?.key ?? "N/A";
  const semesterQuery = selectedSemesterKey ? `?semester=${encodeURIComponent(selectedSemesterKey)}` : "";

  const [session, teachingAssignments, assignmentHints, semesterOverrides] = await Promise.all([
    getServerSession(),
    getCourseTeachingAssignments(course.code, selectedSemesterKey),
    prisma.scheduleEntry.findMany({
      where: {
        course: {
          code: course.code,
        },
        ...(selectedSemesterKey
          ? {
              semester: {
                key: selectedSemesterKey,
              },
            }
          : {}),
      },
      select: {
        classGroup: {
          select: {
            name: true,
          },
        },
        room: true,
        rawTime: true,
      },
      take: 4000,
    }),
    selectedSemesterKey
      ? prisma.courseLecturerOverride.findMany({
          where: {
            courseCode: course.code,
            semesterKey: selectedSemesterKey,
          },
          select: {
            lecturerId: true,
            enabled: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const classGroupOptions = [...new Set(
    [
      ...assignmentHints.map((row) => row.classGroup.name.trim().toUpperCase()).filter(Boolean),
      ...teachingAssignments.map((item) => item.classGroupName).filter((item): item is string => Boolean(item)),
    ],
  )].sort((a, b) => a.localeCompare(b));

  const instructionCodeOptions = [...new Set(
    [
      ...assignmentHints
        .map((row) => extractInstructionCode(row.room ?? row.rawTime))
        .filter((item): item is string => Boolean(item)),
      ...teachingAssignments.map((item) => item.instructionCode).filter((item): item is string => Boolean(item)),
    ],
  )].sort((a, b) => a.localeCompare(b));

  const lecturerNameMap = new Map(bundle.lecturers.map((lecturer) => [lecturer.id, lecturer.name]));
  const lecturerById = new Map(bundle.lecturers.map((lecturer) => [lecturer.id, lecturer]));
  const effectiveLecturerIds = new Set(course.lecturers.map((lecturer) => lecturer.id));
  for (const override of semesterOverrides) {
    if (override.enabled) {
      effectiveLecturerIds.add(override.lecturerId);
    } else {
      effectiveLecturerIds.delete(override.lecturerId);
    }
  }
  for (const assignment of teachingAssignments) {
    effectiveLecturerIds.add(assignment.lecturerId);
  }
  const currentLecturersForSemester = [...effectiveLecturerIds]
    .map((lecturerId) => ({
      id: lecturerId,
      name: lecturerNameMap.get(lecturerId) ?? lecturerId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teachingTeam = [...effectiveLecturerIds]
    .map((lecturerId) => {
      const found = lecturerById.get(lecturerId);
      if (found) {
        return found;
      }

      return {
        id: lecturerId,
        name: lecturerNameMap.get(lecturerId) ?? lecturerId,
        avatarUrl: null,
        profileUrl: null,
        courses: [course.code],
        reviewCount: 0,
        averageRating: null,
        title: null,
        department: null,
        email: null,
        office: null,
        bio: null,
        isCustomized: false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">Chi Tiết Học Phần</p>
        <h1>
          {course.code} - {course.nameEn ?? "Chưa có tiêu đề"}
        </h1>
        <p>{course.nameVi ?? "Chưa cập nhật tên môn tiếng Việt."}</p>
      </section>

      <section className="details-grid">
        <article className="details-card">
          <h2>Thông tin catalog</h2>
          <p>
            <strong>Program:</strong> {course.program ?? "Chưa rõ"}
          </p>
          <p>
            <strong>Section:</strong> {course.section ?? "Chưa rõ"}
          </p>
          <p>
            <strong>Tín chỉ:</strong> {course.credits ?? "N/A"}
          </p>
          <p>
            <strong>Tiên quyết:</strong> {course.prerequisite ?? "Không có"}
          </p>
          <p>
            <strong>Ghi chú:</strong> {course.note ?? "Không có"}
          </p>
          <p>
            <strong>Đánh giá:</strong>{" "}
            {course.averageRating === null ? "Chưa có điểm" : `${course.averageRating.toFixed(2)} / 5`}
          </p>
        </article>

        <article className="details-card">
          <h2>Đội ngũ giảng dạy ({teachingTeam.length})</h2>
          <p className="muted-small">Theo học kỳ: {selectedSemesterLabel}</p>
          {teachingTeam.length === 0 ? (
            <p>Chưa có thông tin giảng viên cho học kỳ này.</p>
          ) : (
            <div className="faculty-grid">
              {teachingTeam.map((lecturer) => (
                <article key={lecturer.id} className="faculty-card">
                  <div className="faculty-card-head">
                    <span className="lecturer-inline-avatar">
                      {lecturer.avatarUrl ? (
                        <img src={lecturer.avatarUrl} alt={`Ảnh giảng viên ${lecturer.name}`} />
                      ) : (
                        <span>{lecturer.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <div className="faculty-card-meta">
                      <Link href={`/lecturers/${lecturer.id}${semesterQuery}`}>{lecturer.name}</Link>
                      <span>
                        {lecturer.averageRating === null
                          ? "Chưa có điểm"
                          : `${lecturer.averageRating.toFixed(2)} / 5`}
                      </span>
                    </div>
                  </div>
                  <p className="muted-small">
                    {lecturer.title ? `${lecturer.title} · ` : ""}
                    {lecturer.department ?? "Chưa có khoa/viện"}
                  </p>
                  <div className="chip-row">
                    <span className="chip">Review: {lecturer.reviewCount}</span>
                    {lecturer.email ? <span className="chip">{lecturer.email}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="details-card mt-card">
        <h2>Học kỳ đang xem</h2>
        <p className="muted-small">
          Phân công giảng viên ở trang này được tính theo học kỳ đang chọn: <strong>{selectedSemesterLabel}</strong>.
        </p>
        {portalMeta.semesters.length > 0 ? (
          <form method="GET" className="admin-form-grid">
            <label className="admin-form-full">
              Chọn học kỳ
              <select name="semester" defaultValue={selectedSemesterKey ?? ""}>
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
          <p>Chưa có dữ liệu học kỳ trong database.</p>
        )}
      </section>

      <section className="details-card mt-card">
        <h2>Phân công giảng viên theo lớp / mã IH</h2>
        {teachingAssignments.length === 0 ? (
          <p>Chưa có phân công theo lớp hoặc mã IH cho môn này ở học kỳ đang chọn.</p>
        ) : (
          <ul className="simple-list">
            {teachingAssignments.map((item) => (
              <li key={item.id}>
                <div className="line-spread">
                  <strong>
                    <Link href={`/lecturers/${item.lecturerId}${semesterQuery}`}>{item.lecturerName}</Link>
                  </strong>
                  <span className="muted-small">{new Date(item.updatedAt).toLocaleString("vi-VN")}</span>
                </div>
                <p className="muted-small">
                  Lớp: <strong>{item.classGroupName ?? "ALL"}</strong> · Mã instruction:{" "}
                  <strong>{item.instructionCode ?? "ALL"}</strong>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {session?.role === "STUDENT" ? (
        <section className="details-card mt-card">
          <h2>Gửi đánh giá của bạn</h2>
          <p className="muted-small">Chỉ tài khoản sinh viên được gửi review. Dữ liệu lưu trong database portal.</p>
          <StudentReviewForm
            courseCode={course.code}
            lecturers={teachingTeam.map((lecturer) => ({
              id: lecturer.id,
              name: lecturer.name,
            }))}
          />
        </section>
      ) : null}

      {session?.role === "ADMIN" ? (
        <section className="details-card mt-card">
          <h2>Quản lý giảng viên theo học phần (Admin)</h2>
          <p className="muted-small">
            Thêm/bỏ giảng viên khỏi môn học cho đúng học kỳ đang chọn. Có thể tạo lecturer mới ngay tại đây.
          </p>
          {selectedSemesterKey ? (
            <CourseLecturerAdminForm
              courseCode={course.code}
              semesterKey={selectedSemesterKey}
              currentLecturers={currentLecturersForSemester}
              allLecturers={bundle.lecturers.map((lecturer) => ({ id: lecturer.id, name: lecturer.name }))}
              teachingAssignments={teachingAssignments}
              classGroupOptions={classGroupOptions}
              instructionCodeOptions={instructionCodeOptions}
            />
          ) : (
            <p className="status-error">Không tìm thấy học kỳ để áp dụng phân công giảng viên.</p>
          )}
        </section>
      ) : null}

      <section className="details-card mt-card">
        <h2>Review và nhận xét ({course.reviews.length})</h2>
        {course.reviews.length === 0 ? (
          <p>Chưa có nhận xét nào.</p>
        ) : (
          <ul className="review-list">
            {course.reviews.map((review) => (
              <li key={review.id} className={`review-item sentiment-${review.sentiment}`}>
                <div className="line-spread">
                  <strong>{review.lecturerName ?? "Nhận xét chung"}</strong>
                  <span>{review.rating === null ? "N/A" : `${review.rating} / 5`}</span>
                </div>
                <p>{review.content}</p>
                <span className="muted-small">{formatReviewMeta(review.createdAt, review.sourceType, review.authorName)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="details-card mt-card">
        <div className="line-spread">
          <h2>Học liệu môn học ({course.resources.length})</h2>
          <Link href={`/resources?course=${encodeURIComponent(course.code)}`} className="inline-link">
            Mở kho học liệu
          </Link>
        </div>
        {course.resources.length === 0 ? (
          <p>Không có tệp trong thư mục resources cho môn này.</p>
        ) : (
          <ul className="simple-list">
            {course.resources.map((resource) => (
              <li key={resource.relativePath}>
                <div className="line-spread">
                  <Link
                    href={`/resources/view?course=${encodeURIComponent(course.code)}&path=${encodeURIComponent(resource.relativePath)}`}
                  >
                    {resource.relativePath}
                  </Link>
                  <span>{formatSize(resource.sizeBytes)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="hint-text">
        <Link href="/courses">Quay lại catalog</Link> · <Link href="/lecturers">Giảng viên</Link>
      </p>
    </main>
  );
}
