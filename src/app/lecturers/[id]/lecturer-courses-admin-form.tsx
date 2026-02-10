"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type CourseOption = {
  code: string;
  nameEn: string | null;
  nameVi: string | null;
};

type LecturerCoursesAdminFormProps = {
  lecturerId: string;
  lecturerName: string;
  semesterKey: string;
  semesterLabel: string;
  currentCourseCodes: string[];
  globalCourseCodes: string[];
  allCourses: CourseOption[];
};

type ApiResult = {
  ok?: boolean;
  error?: string;
};

function courseLabel(course: CourseOption): string {
  return `${course.code} · ${course.nameVi ?? course.nameEn ?? "Chưa cập nhật tên môn"}`;
}

export function LecturerCoursesAdminForm({
  lecturerId,
  lecturerName,
  semesterKey,
  semesterLabel,
  currentCourseCodes,
  globalCourseCodes,
  allCourses,
}: LecturerCoursesAdminFormProps) {
  const router = useRouter();
  const [selectedCourseCode, setSelectedCourseCode] = useState("");
  const [scope, setScope] = useState<"SEMESTER" | "GLOBAL">("SEMESTER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentCourseSet = useMemo(() => new Set(currentCourseCodes), [currentCourseCodes]);
  const globalCourseSet = useMemo(() => new Set(globalCourseCodes), [globalCourseCodes]);
  const semesterOnlyCourseCodes = useMemo(
    () => currentCourseCodes.filter((courseCode) => !globalCourseSet.has(courseCode)),
    [currentCourseCodes, globalCourseSet],
  );

  const sortedCourses = useMemo(
    () => [...allCourses].sort((a, b) => a.code.localeCompare(b.code)),
    [allCourses],
  );

  async function callApi(method: "POST" | "DELETE", courseCode: string, assignmentScope: "SEMESTER" | "GLOBAL") {
    if (assignmentScope === "SEMESTER" && !semesterKey) {
      setError("Vui lòng chọn học kỳ trước khi cập nhật phân công.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/course-lecturers", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseCode,
          semesterKey: assignmentScope === "GLOBAL" ? "" : semesterKey,
          scope: assignmentScope,
          lecturerId,
          lecturerName,
        }),
      });

      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Không thể cập nhật môn giảng dạy.");
        return;
      }

      const scopeLabel = assignmentScope === "GLOBAL" ? "mặc định mọi kỳ" : `học kỳ ${semesterLabel}`;
      setMessage(method === "POST" ? `Đã thêm môn ở phạm vi ${scopeLabel}.` : `Đã bỏ môn ở phạm vi ${scopeLabel}.`);
      setSelectedCourseCode("");
      router.refresh();
    } catch {
      setError("Không kết nối được dịch vụ cập nhật giảng dạy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-form-stack">
      <form
        className="admin-form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selectedCourseCode) {
            setError("Vui lòng chọn môn cần thêm.");
            return;
          }

          void callApi("POST", selectedCourseCode, scope);
        }}
      >
        <label className="admin-form-full">
          Phạm vi áp dụng
          <select value={scope} onChange={(event) => setScope(event.target.value as "SEMESTER" | "GLOBAL")}>
            <option value="SEMESTER">Chỉ học kỳ đang chọn ({semesterLabel})</option>
            <option value="GLOBAL">Mặc định mọi kỳ</option>
          </select>
        </label>

        <label className="admin-form-full">
          Thêm môn giảng dạy cho giảng viên này
          <select value={selectedCourseCode} onChange={(event) => setSelectedCourseCode(event.target.value)}>
            <option value="">Chọn học phần</option>
            {sortedCourses.map((course) => (
              <option key={course.code} value={course.code}>
                {courseLabel(course)}
                {" "}
                {globalCourseSet.has(course.code)
                  ? "(đã có mặc định mọi kỳ)"
                  : currentCourseSet.has(course.code)
                    ? "(đã có trong kỳ này)"
                    : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="button-primary" disabled={busy}>
            {busy ? "Đang cập nhật..." : "Thêm môn"}
          </button>
        </div>
      </form>

      <div>
        <h3>Môn mặc định mọi kỳ</h3>
        {globalCourseCodes.length === 0 ? (
          <p className="muted-small">Chưa có môn mặc định mọi kỳ.</p>
        ) : (
          <ul className="simple-list">
            {globalCourseCodes.map((courseCode) => (
              <li key={courseCode} className="line-spread">
                <span>{courseCode}</span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => {
                    void callApi("DELETE", courseCode, "GLOBAL");
                  }}
                >
                  Bỏ mặc định
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Môn bổ sung ở học kỳ {semesterLabel}</h3>
        {semesterOnlyCourseCodes.length === 0 ? (
          <p className="muted-small">Không có môn bổ sung riêng cho học kỳ này.</p>
        ) : (
          <ul className="simple-list">
            {semesterOnlyCourseCodes.map((courseCode) => (
              <li key={`semester-${courseCode}`} className="line-spread">
                <span>{courseCode}</span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => {
                    void callApi("DELETE", courseCode, "SEMESTER");
                  }}
                >
                  Bỏ ở kỳ này
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
    </div>
  );
}
