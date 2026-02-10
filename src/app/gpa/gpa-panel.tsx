"use client";

import { type FormEvent, useMemo, useState } from "react";

import { GRADE_SPECS, type GpaSummary, normalizeGradeLetter, normalizeSemesterKey } from "@/lib/gpa";
import { compareSemesterKeyDesc } from "@/lib/semester";

type SemesterOption = {
  key: string;
  label: string;
};

type CourseOption = {
  code: string;
  nameEn: string | null;
  nameVi: string | null;
  credits: number | null;
};

type GradeEntry = {
  id: string;
  semesterKey: string;
  courseCode: string;
  courseName: string | null;
  credits: number;
  gradeLetter: string;
  gradePoint: number | null;
  includeInGpa: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type GpaPanelProps = {
  username: string;
  role: string;
  semesters: SemesterOption[];
  courses: CourseOption[];
  initialEntries: GradeEntry[];
  initialSummary: GpaSummary;
};

type GpaApiPayload = {
  ok?: boolean;
  error?: string;
  entries?: GradeEntry[];
  summary?: GpaSummary;
  entry?: GradeEntry;
};

function gradeLabel(letter: string): string {
  return GRADE_SPECS.find((item) => item.letter === letter)?.labelVi ?? letter;
}

function courseLabel(course: CourseOption): string {
  const title = course.nameVi ?? course.nameEn ?? "No title";
  const credit = typeof course.credits === "number" ? `${course.credits} tín chỉ` : "Chưa có tín chỉ";
  return `${course.code} · ${title} · ${credit}`;
}

function normalizeCourseCodeInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function formatGpa(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(2);
}

function gpaPercent(value: number | null): number {
  if (value === null) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / 4) * 100));
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("vi-VN");
}

export function GpaPanel({
  username,
  role,
  semesters,
  courses,
  initialEntries,
  initialSummary,
}: GpaPanelProps) {
  const [entries, setEntries] = useState<GradeEntry[]>(initialEntries);
  const [summary, setSummary] = useState<GpaSummary>(initialSummary);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultSemester = semesters[0]?.key ?? initialEntries[0]?.semesterKey ?? "";
  const [entryId, setEntryId] = useState<string | null>(null);
  const [semesterKey, setSemesterKey] = useState(defaultSemester);
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [credits, setCredits] = useState("");
  const [gradeLetter, setGradeLetter] = useState("A");
  const [note, setNote] = useState("");
  const [catalogPick, setCatalogPick] = useState("");
  const [semesterFilter, setSemesterFilter] = useState<string>("ALL");

  const isStudent = role === "STUDENT";

  const courseByCode = useMemo(
    () => new Map(courses.map((course) => [normalizeCourseCodeInput(course.code), course])),
    [courses],
  );
  const semesterLabelMap = useMemo(
    () => new Map(semesters.map((semester) => [normalizeSemesterKey(semester.key) ?? semester.key, semester.label])),
    [semesters],
  );
  const sortedCourses = useMemo(
    () =>
      [...courses].sort((a, b) => {
        const codeDelta = a.code.localeCompare(b.code);
        if (codeDelta !== 0) {
          return codeDelta;
        }

        const titleA = a.nameVi ?? a.nameEn ?? "";
        const titleB = b.nameVi ?? b.nameEn ?? "";
        return titleA.localeCompare(titleB);
      }),
    [courses],
  );
  const getSemesterLabel = (value: string) =>
    semesterLabelMap.get(normalizeSemesterKey(value) ?? value) ?? value;

  const displayedEntries = useMemo(() => {
    const filtered =
      semesterFilter === "ALL"
        ? entries
        : entries.filter((entry) => normalizeSemesterKey(entry.semesterKey) === normalizeSemesterKey(semesterFilter));

    return [...filtered].sort((a, b) => {
      const semesterDelta = compareSemesterKeyDesc(a.semesterKey, b.semesterKey);
      if (semesterDelta !== 0) {
        return semesterDelta;
      }
      return a.courseCode.localeCompare(b.courseCode);
    });
  }, [entries, semesterFilter]);

  const filteredStats = useMemo(() => {
    let totalCredits = 0;
    let countedCredits = 0;
    let qualityPoints = 0;

    for (const entry of displayedEntries) {
      totalCredits += entry.credits;

      if (entry.includeInGpa && entry.gradePoint !== null) {
        countedCredits += entry.credits;
        qualityPoints += entry.gradePoint * entry.credits;
      }
    }

    return {
      totalCredits,
      countedCredits,
      qualityPoints,
      gpa: countedCredits > 0 ? qualityPoints / countedCredits : null,
    };
  }, [displayedEntries]);

  async function reloadEntries() {
    const response = await fetch("/api/gpa", {
      method: "GET",
    });

    const payload = (await response.json()) as GpaApiPayload;
    if (!response.ok || !payload.ok || !payload.entries || !payload.summary) {
      throw new Error(payload.error ?? "Failed to refresh GPA entries.");
    }

    setEntries(payload.entries);
    setSummary(payload.summary);
  }

  function resetForm() {
    setEntryId(null);
    setSemesterKey(defaultSemester);
    setCourseCode("");
    setCourseName("");
    setCredits("");
    setGradeLetter("A");
    setNote("");
    setCatalogPick("");
  }

  async function onSaveGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStudent) {
      setError("Chức năng GPA hiện chỉ áp dụng cho tài khoản sinh viên.");
      return;
    }

    const normalizedSemester = normalizeSemesterKey(semesterKey);
    const normalizedCourseCode = normalizeCourseCodeInput(courseCode);
    if (!normalizedSemester) {
      setError("Vui lòng chọn học kỳ.");
      return;
    }
    if (!normalizedCourseCode) {
      setError("Vui lòng nhập mã học phần.");
      return;
    }

    const normalizedGrade = normalizeGradeLetter(gradeLetter);
    if (!normalizedGrade) {
      setError("Điểm chữ không hợp lệ.");
      return;
    }

    const parsedCredits = Number.parseInt(credits, 10);
    if (!Number.isFinite(parsedCredits) || parsedCredits < 1 || parsedCredits > 12) {
      setError("Số tín chỉ phải từ 1 đến 12.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const endpointMethod = entryId ? "PATCH" : "POST";
      const response = await fetch("/api/gpa", {
        method: endpointMethod,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(entryId ? { id: entryId } : {}),
          semesterKey: normalizedSemester,
          courseCode: normalizedCourseCode,
          courseName: courseName || null,
          credits: parsedCredits,
          gradeLetter: normalizedGrade,
          note: note || null,
        }),
      });

      const payload = (await response.json()) as GpaApiPayload;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Không thể lưu điểm GPA.");
        return;
      }

      await reloadEntries();
      setMessage(entryId ? "Đã cập nhật điểm học phần." : "Đã thêm điểm học phần.");
      resetForm();
    } catch {
      setError("Không kết nối được dịch vụ GPA.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteEntry(id: string) {
    if (!isStudent) {
      setError("Chức năng GPA hiện chỉ áp dụng cho tài khoản sinh viên.");
      return;
    }

    const confirmed = window.confirm("Xoá học phần này khỏi bảng GPA?");
    if (!confirmed) {
      return;
    }

    setBusyId(id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/gpa", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const payload = (await response.json()) as GpaApiPayload;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Không thể xóa học phần GPA.");
        return;
      }

      await reloadEntries();
      setMessage("Đã xoá học phần khỏi GPA.");
      if (entryId === id) {
        resetForm();
      }
    } catch {
      setError("Không kết nối được dịch vụ GPA.");
    } finally {
      setBusyId(null);
    }
  }

  function onEditEntry(entry: GradeEntry) {
    setEntryId(entry.id);
    setSemesterKey(entry.semesterKey);
    setCourseCode(entry.courseCode);
    setCourseName(entry.courseName ?? "");
    setCredits(String(entry.credits));
    setGradeLetter(normalizeGradeLetter(entry.gradeLetter) ?? "A");
    setNote(entry.note ?? "");
    setMessage(null);
    setError(null);
  }

  function onPickCourse(nextCode: string) {
    const normalizedCode = normalizeCourseCodeInput(nextCode);
    setCourseCode(normalizedCode);
    const course = courseByCode.get(normalizedCode);
    if (!course) {
      return;
    }

    if (!courseName.trim()) {
      setCourseName(course.nameVi ?? course.nameEn ?? "");
    }
    if (!credits.trim() && typeof course.credits === "number") {
      setCredits(String(course.credits));
    }
  }

  return (
    <section className="gpa-shell">
      <section className="gpa-kpi-grid">
        <article className="details-card gpa-kpi-card gpa-kpi-primary">
          <h2>CGPA tích lũy</h2>
          <p className="gpa-main-value">{formatGpa(summary.overall.gpa)}</p>
          <div className="gpa-meter">
            <span style={{ width: `${gpaPercent(summary.overall.gpa)}%` }} />
          </div>
          <div className="chip-row">
            <span className="chip">Thang 4.0</span>
            <span className="chip">{summary.overall.countedCredits} tín chỉ tính GPA</span>
            <span className="chip">{summary.overall.qualityPoints.toFixed(2)} quality points</span>
          </div>
        </article>

        <article className="details-card gpa-kpi-card">
          <h2>Tổng quan học phần</h2>
          <p className="gpa-secondary-value">{summary.overall.totalCourses}</p>
          <p className="muted-small">học phần đã nhập trong bảng điểm cá nhân.</p>
          <div className="chip-row">
            <span className="chip">{summary.overall.totalCredits} tổng tín chỉ</span>
            <span className="chip">{summary.bySemester.length} học kỳ</span>
          </div>
        </article>

        <article className="details-card gpa-kpi-card">
          <h2>Bộ lọc hiện tại</h2>
          <p className="gpa-secondary-value">{formatGpa(filteredStats.gpa)}</p>
          <p className="muted-small">
            GPA theo bộ lọc{" "}
            {semesterFilter === "ALL"
              ? "tất cả học kỳ"
              : `học kỳ ${getSemesterLabel(semesterFilter)}`}.
          </p>
          <div className="chip-row">
            <span className="chip">{displayedEntries.length} học phần</span>
            <span className="chip">{filteredStats.countedCredits} tín chỉ tính GPA</span>
          </div>
        </article>
      </section>

      <section className="gpa-workspace-grid">
        <article className="details-card gpa-entry-editor">
          <div className="gpa-panel-head">
            <h2>{entryId ? "Cập nhật điểm học phần" : "Thêm điểm học phần"}</h2>
            <p className="muted-small">Sinh viên: {username}</p>
          </div>
          <form className="admin-form-grid gpa-form-grid" onSubmit={onSaveGrade}>
            <label>
              Học kỳ
              {semesters.length > 0 ? (
                <select value={semesterKey} onChange={(event) => setSemesterKey(event.target.value)} disabled={!isStudent || saving}>
                  <option value="">Chọn học kỳ</option>
                  {semesters.map((semester) => (
                    <option key={semester.key} value={semester.key}>
                      {semester.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={semesterKey}
                  onChange={(event) => setSemesterKey(event.target.value)}
                  placeholder="SPRING_2026"
                  disabled={!isStudent || saving}
                />
              )}
            </label>

            <label>
              Mã học phần
              <input
                value={courseCode}
                onChange={(event) => onPickCourse(event.target.value)}
                placeholder="CS 2255"
                list="gpa-course-options"
                required
                disabled={!isStudent || saving}
              />
            </label>

            <label>
              Chọn nhanh từ danh mục
              <select
                value={catalogPick}
                onChange={(event) => {
                  const picked = event.target.value;
                  setCatalogPick("");
                  if (picked) {
                    onPickCourse(picked);
                  }
                }}
                disabled={!isStudent || saving}
              >
                <option value="">Xem toàn bộ học phần...</option>
                {sortedCourses.map((course) => (
                  <option key={`pick-${course.code}`} value={course.code}>
                    {courseLabel(course)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tên học phần (tuỳ chọn)
              <input
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                placeholder="Lập trình Web"
                disabled={!isStudent || saving}
              />
            </label>

            <label>
              Tín chỉ
              <input
                type="number"
                min={1}
                max={12}
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
                required
                disabled={!isStudent || saving}
              />
            </label>

            <label>
              Điểm chữ
              <select value={gradeLetter} onChange={(event) => setGradeLetter(event.target.value)} disabled={!isStudent || saving}>
                {GRADE_SPECS.map((grade) => (
                  <option key={grade.letter} value={grade.letter}>
                    {grade.letter} · {grade.labelVi}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-form-full">
              Ghi chú (tuỳ chọn)
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Môn cải thiện / học lại..."
                disabled={!isStudent || saving}
              />
            </label>

            <div className="admin-form-actions gpa-action-row">
              <button type="submit" className="button-primary" disabled={!isStudent || saving}>
                {saving ? "Đang lưu..." : entryId ? "Cập nhật môn" : "Thêm môn"}
              </button>
              <button type="button" className="button-secondary" onClick={resetForm} disabled={saving}>
                Đặt lại form
              </button>
            </div>
          </form>
        </article>

        <article className="details-card gpa-semester-panel">
          <div className="gpa-panel-head">
            <h2>Hiệu suất theo học kỳ</h2>
            <p className="muted-small">Theo dõi xu hướng GPA từng kỳ để lên kế hoạch học tập.</p>
          </div>
          {summary.bySemester.length === 0 ? (
            <p className="empty-state">Chưa có học kỳ nào đủ dữ liệu để tính GPA.</p>
          ) : (
            <div className="gpa-semester-list">
              {summary.bySemester.map((item) => (
                <article key={item.semesterKey} className="gpa-semester-card">
                  <div className="gpa-semester-head">
                    <strong>{getSemesterLabel(item.semesterKey)}</strong>
                    <span>{formatGpa(item.gpa)}</span>
                  </div>
                  <div className="gpa-meter">
                    <span style={{ width: `${gpaPercent(item.gpa)}%` }} />
                  </div>
                  <div className="chip-row">
                    <span className="chip">{item.totalCourses} học phần</span>
                    <span className="chip">{item.countedCredits}/{item.totalCredits} tín chỉ GPA</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>

      <datalist id="gpa-course-options">
        {sortedCourses.map((course) => (
          <option key={course.code} value={course.code}>
            {courseLabel(course)}
          </option>
        ))}
      </datalist>

      <section className="details-card gpa-transcript-panel">
        <div className="line-spread gpa-list-head">
          <h2>Bảng điểm học phần</h2>
          <label className="gpa-filter-label">
            Lọc theo kỳ
            <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}>
              <option value="ALL">Tất cả học kỳ</option>
              {semesters.map((semester) => (
                <option key={semester.key} value={semester.key}>
                  {semester.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {displayedEntries.length === 0 ? (
          <p className="empty-state">Chưa có dữ liệu GPA trong bộ lọc hiện tại.</p>
        ) : (
          <div className="gpa-table-scroll">
            <table className="gpa-table">
              <thead>
                <tr>
                  <th>Học phần</th>
                  <th>Kỳ</th>
                  <th>Tín chỉ</th>
                  <th>Điểm</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú</th>
                  <th>Cập nhật</th>
                  <th>Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {displayedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong className="gpa-course-code">{entry.courseCode}</strong>
                      <p className="muted-small">{entry.courseName ?? "Chưa cập nhật tên môn"}</p>
                    </td>
                    <td>{getSemesterLabel(entry.semesterKey)}</td>
                    <td>{entry.credits}</td>
                    <td>
                      <strong className="gpa-grade">{entry.gradeLetter}</strong>
                      <p className="muted-small">{entry.gradePoint !== null ? entry.gradePoint.toFixed(1) : "Excluded"}</p>
                    </td>
                    <td>
                      <span className={`chip ${entry.includeInGpa ? "" : "chip-muted"}`}>
                        {entry.includeInGpa ? "Tính GPA" : "Không tính GPA"}
                      </span>
                    </td>
                    <td>{entry.note ?? "—"}</td>
                    <td>{formatUpdatedAt(entry.updatedAt)}</td>
                    <td>
                      <div className="gpa-inline-actions">
                        <button
                          type="button"
                          className="button-secondary gpa-inline-button"
                          onClick={() => onEditEntry(entry)}
                          disabled={busyId === entry.id || saving}
                        >
                          Chỉnh sửa
                        </button>
                        <button
                          type="button"
                          className="button-danger gpa-inline-button"
                          onClick={() => void onDeleteEntry(entry.id)}
                          disabled={busyId === entry.id || saving || !isStudent}
                        >
                          {busyId === entry.id ? "Đang xoá..." : "Xoá"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
      {!isStudent ? <p className="status-error">Tính năng GPA chỉ dành cho tài khoản sinh viên.</p> : null}
      <p className="hint-text">Thang điểm: {GRADE_SPECS.map((grade) => `${grade.letter}=${gradeLabel(grade.letter)}`).join(", ")}</p>
    </section>
  );
}
