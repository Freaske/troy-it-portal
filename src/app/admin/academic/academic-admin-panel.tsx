"use client";

import { DayOfWeek, SessionPeriod } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SemesterItem = {
  key: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  cohortCount: number;
  classGroupCount: number;
  entryCount: number;
};

type CohortItem = {
  code: string;
  classGroupCount: number;
};

type ClassGroupItem = {
  name: string;
  entryCount: number;
};

type CourseItem = {
  code: string;
  nameEn: string | null;
  nameVi: string | null;
};

type ScheduleEntryItem = {
  id: string;
  courseCode: string;
  courseNameEn: string | null;
  courseNameVi: string | null;
  dayOfWeek: DayOfWeek;
  session: SessionPeriod;
  startTime: string | null;
  room: string | null;
  rawTime: string | null;
  sourceSheet: string;
  sourceRow: number;
};

type AcademicAdminPanelProps = {
  selectedSemesterKey: string | null;
  selectedCohortCode: string | null;
  selectedClassGroupName: string | null;
  semesters: SemesterItem[];
  cohorts: CohortItem[];
  classGroups: ClassGroupItem[];
  courses: CourseItem[];
  entries: ScheduleEntryItem[];
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  copiedEntries?: number;
  copiedTeachingAssignments?: number;
  copiedFromClassGroupName?: string | null;
};

const DAY_OPTIONS = Object.values(DayOfWeek);
const SESSION_OPTIONS = Object.values(SessionPeriod);
const DAY_FILTER_OPTIONS: Array<DayOfWeek | "ALL"> = ["ALL", ...DAY_OPTIONS];

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: "Thứ 2",
  TUE: "Thứ 3",
  WED: "Thứ 4",
  THU: "Thứ 5",
  FRI: "Thứ 6",
  SAT: "Thứ 7",
  SUN: "Chủ nhật",
};

type PanelTab = "structure" | "schedule";

function courseLabel(course: CourseItem): string {
  return `${course.code} · ${course.nameVi ?? course.nameEn ?? "No title"}`;
}

function buildEntrySearchText(entry: ScheduleEntryItem): string {
  return [
    entry.courseCode,
    entry.courseNameVi,
    entry.courseNameEn,
    entry.room,
    entry.rawTime,
    entry.startTime,
    entry.dayOfWeek,
    entry.session,
    entry.sourceSheet,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

export function AcademicAdminPanel({
  selectedSemesterKey,
  selectedCohortCode,
  selectedClassGroupName,
  semesters,
  cohorts,
  classGroups,
  courses,
  entries,
}: AcademicAdminPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PanelTab>("structure");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newSemesterKey, setNewSemesterKey] = useState("");
  const [newSemesterLabel, setNewSemesterLabel] = useState("");
  const [newSemesterStartDate, setNewSemesterStartDate] = useState("");
  const [newSemesterEndDate, setNewSemesterEndDate] = useState("");

  const [newCohortCode, setNewCohortCode] = useState("");
  const [newClassGroupName, setNewClassGroupName] = useState("");
  const [copyFromClassGroupName, setCopyFromClassGroupName] = useState("");

  const [addCourseCode, setAddCourseCode] = useState("");
  const [addCourseNameEn, setAddCourseNameEn] = useState("");
  const [addCourseNameVi, setAddCourseNameVi] = useState("");
  const [addDayOfWeek, setAddDayOfWeek] = useState<DayOfWeek>(DayOfWeek.MON);
  const [addSession, setAddSession] = useState<SessionPeriod>(SessionPeriod.UNKNOWN);
  const [addStartTime, setAddStartTime] = useState("");
  const [addRoom, setAddRoom] = useState("");
  const [addRawTime, setAddRawTime] = useState("");
  const [entryFilterDay, setEntryFilterDay] = useState<DayOfWeek | "ALL">("ALL");
  const [entrySearch, setEntrySearch] = useState("");

  const selectedSemester = useMemo(
    () => semesters.find((semester) => semester.key === selectedSemesterKey) ?? null,
    [semesters, selectedSemesterKey],
  );

  async function callApi(
    method: "POST" | "PATCH" | "DELETE",
    payload: Record<string, unknown>,
    successMessage: string,
  ): Promise<ApiResponse | null> {
    setBusy(`${method}:${String(payload.type ?? "unknown")}:${String(payload.id ?? "")}`);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/academic", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Academic operation failed.");
        return null;
      }

      setMessage(successMessage);
      router.refresh();
      return body;
    } catch {
      setError("Không kết nối được dịch vụ quản trị học vụ.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const hasScope = Boolean(selectedSemesterKey && selectedCohortCode && selectedClassGroupName);
  const totalClassGroupEntries = classGroups.reduce((sum, classGroup) => sum + classGroup.entryCount, 0);
  const entrySearchQuery = entrySearch.trim().toUpperCase();
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (entryFilterDay !== "ALL" && entry.dayOfWeek !== entryFilterDay) {
        return false;
      }

      if (!entrySearchQuery) {
        return true;
      }

      return buildEntrySearchText(entry).includes(entrySearchQuery);
    });
  }, [entries, entryFilterDay, entrySearchQuery]);

  const groupedEntries = useMemo(() => {
    const bucket = new Map<DayOfWeek, ScheduleEntryItem[]>();
    DAY_OPTIONS.forEach((day) => {
      bucket.set(day, []);
    });

    for (const entry of filteredEntries) {
      bucket.get(entry.dayOfWeek)?.push(entry);
    }

    for (const day of DAY_OPTIONS) {
      const items = bucket.get(day) ?? [];
      items.sort((a, b) => {
        const timeA = a.startTime ?? "99:99";
        const timeB = b.startTime ?? "99:99";
        const timeDelta = timeA.localeCompare(timeB);
        if (timeDelta !== 0) {
          return timeDelta;
        }
        return a.courseCode.localeCompare(b.courseCode);
      });
    }

    return DAY_OPTIONS.map((day) => ({
      day,
      label: DAY_LABEL[day],
      items: bucket.get(day) ?? [],
    }));
  }, [filteredEntries]);

  function renderScopePill(label: string, value: string | null) {
    return (
      <span className={`admin-scope-pill ${value ? "" : "is-missing"}`}>
        <small>{label}</small>
        <strong>{value ?? "Chưa chọn"}</strong>
      </span>
    );
  }

  return (
    <section className="admin-workspace">
      <article className="details-card admin-workspace-toolbar">
        <div className="admin-step-strip">
          <span className="admin-step-pill">
            <strong>1</strong> Chọn phạm vi kỳ/khóa/lớp
          </span>
          <span className="admin-step-pill">
            <strong>2</strong> Quản lý cấu trúc học vụ
          </span>
          <span className="admin-step-pill">
            <strong>3</strong> Sửa từng slot thời khóa biểu
          </span>
        </div>

        <div className="admin-scope-row">
          {renderScopePill("Học kỳ", selectedSemesterKey)}
          {renderScopePill("Cohort", selectedCohortCode)}
          {renderScopePill("Class group", selectedClassGroupName)}
          <span className="admin-scope-pill">
            <small>Slots trong scope</small>
            <strong>{entries.length}</strong>
          </span>
        </div>

        <div className="admin-tab-switch">
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "structure" ? "active" : ""}`}
            onClick={() => setActiveTab("structure")}
          >
            Structure Manager
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === "schedule" ? "active" : ""}`}
            onClick={() => setActiveTab("schedule")}
          >
            Timetable Editor
          </button>
        </div>
      </article>

      {activeTab === "structure" ? (
        <section className="admin-ops-grid">
          <article className="details-card admin-module-card">
            <header className="admin-section-heading">
              <h2>Semester Management</h2>
              <p className="muted-small">
                Tạo và cập nhật học kỳ. Khi xóa học kỳ, toàn bộ cohort/class/entries của kỳ đó cũng bị xóa.
              </p>
            </header>

            <div className="admin-kpi-row">
              <span className="chip">Semesters: {semesters.length}</span>
              <span className="chip">Cohorts: {cohorts.length}</span>
              <span className="chip">Class groups: {classGroups.length}</span>
              <span className="chip">Entries: {entries.length}</span>
            </div>

            <form
              className="admin-form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await callApi(
                  "POST",
                  {
                    type: "semester",
                    semesterKey: newSemesterKey,
                    label: newSemesterLabel,
                    startDate: newSemesterStartDate || null,
                    endDate: newSemesterEndDate || null,
                  },
                  "Đã thêm học kỳ.",
                );

                if (ok) {
                  setNewSemesterKey("");
                  setNewSemesterLabel("");
                  setNewSemesterStartDate("");
                  setNewSemesterEndDate("");
                }
              }}
            >
              <label>
                Semester key
                <input
                  value={newSemesterKey}
                  onChange={(event) => setNewSemesterKey(event.target.value)}
                  placeholder="SPRING_2027"
                />
              </label>
              <label>
                Label
                <input
                  value={newSemesterLabel}
                  onChange={(event) => setNewSemesterLabel(event.target.value)}
                  placeholder="SPRING 2027"
                />
              </label>
              <label>
                Start date
                <input type="date" value={newSemesterStartDate} onChange={(event) => setNewSemesterStartDate(event.target.value)} />
              </label>
              <label>
                End date
                <input type="date" value={newSemesterEndDate} onChange={(event) => setNewSemesterEndDate(event.target.value)} />
              </label>
              <div className="admin-form-actions">
                <button className="button-primary" type="submit" disabled={Boolean(busy)}>
                  {busy ? "Processing..." : "Add Semester"}
                </button>
              </div>
            </form>

            {selectedSemester ? (
              <form
                key={`semester-edit-${selectedSemester.key}`}
                className="admin-form-grid mt-card"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  await callApi(
                    "PATCH",
                    {
                      type: "semester",
                      semesterKey: selectedSemester.key,
                      newSemesterKey: String(formData.get("newSemesterKey") ?? ""),
                      label: String(formData.get("label") ?? ""),
                      startDate: String(formData.get("startDate") ?? ""),
                      endDate: String(formData.get("endDate") ?? ""),
                    },
                    "Đã cập nhật học kỳ.",
                  );
                }}
              >
                <label>
                  Rename key
                  <input name="newSemesterKey" defaultValue={selectedSemester.key} />
                </label>
                <label>
                  Label
                  <input name="label" defaultValue={selectedSemester.label} />
                </label>
                <label>
                  Start date
                  <input type="date" name="startDate" defaultValue={selectedSemester.startDate ?? ""} />
                </label>
                <label>
                  End date
                  <input type="date" name="endDate" defaultValue={selectedSemester.endDate ?? ""} />
                </label>
                <div className="admin-form-actions line-spread">
                  <button type="submit" className="button-primary" disabled={Boolean(busy)}>
                    Update Semester
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={Boolean(busy)}
                    onClick={async () => {
                      if (!selectedSemesterKey) {
                        return;
                      }
                      const confirmed = window.confirm(
                        `Xóa học kỳ ${selectedSemesterKey}? Toàn bộ cohort/class/schedule trong kỳ này sẽ bị xóa.`,
                      );
                      if (!confirmed) {
                        return;
                      }

                      await callApi(
                        "DELETE",
                        {
                          type: "semester",
                          semesterKey: selectedSemesterKey,
                        },
                        "Đã xóa học kỳ.",
                      );
                    }}
                  >
                    Delete Semester
                  </button>
                </div>
              </form>
            ) : null}

            <div className="admin-table-wrap mt-card">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Semester</th>
                    <th>Cohorts</th>
                    <th>Class Groups</th>
                    <th>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {semesters.map((semester) => (
                    <tr key={semester.key} className={selectedSemesterKey === semester.key ? "admin-row-selected" : ""}>
                      <td>{semester.label}</td>
                      <td>{semester.cohortCount}</td>
                      <td>{semester.classGroupCount}</td>
                      <td>{semester.entryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="details-card admin-module-card">
            <header className="admin-section-heading">
              <h2>Cohort & Class Group</h2>
              <p className="muted-small">Thao tác trực tiếp trên cấu trúc lớp thuộc học kỳ đang chọn.</p>
            </header>

            {!selectedSemesterKey ? <p className="status-error">Chưa có học kỳ để thao tác.</p> : null}

            <form
              className="admin-form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!selectedSemesterKey) {
                  setError("Vui lòng chọn học kỳ trước.");
                  return;
                }

                const ok = await callApi(
                  "POST",
                  {
                    type: "cohort",
                    semesterKey: selectedSemesterKey,
                    cohortCode: newCohortCode,
                  },
                  "Đã thêm cohort.",
                );

                if (ok) {
                  setNewCohortCode("");
                }
              }}
            >
              <label>
                Add cohort
                <input value={newCohortCode} onChange={(event) => setNewCohortCode(event.target.value)} placeholder="K71" />
              </label>
              <div className="admin-form-actions">
                <button type="submit" className="button-primary" disabled={Boolean(busy) || !selectedSemesterKey}>
                  Add Cohort
                </button>
              </div>
            </form>

            <form
              key={`cohort-edit-${selectedCohortCode ?? "none"}`}
              className="admin-form-grid mt-card"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!selectedSemesterKey || !selectedCohortCode) {
                  setError("Vui lòng chọn cohort để đổi mã.");
                  return;
                }

                const formData = new FormData(event.currentTarget);
                await callApi(
                  "PATCH",
                  {
                    type: "cohort",
                    semesterKey: selectedSemesterKey,
                    cohortCode: selectedCohortCode,
                    newCohortCode: String(formData.get("newCohortCode") ?? ""),
                  },
                  "Đã cập nhật cohort.",
                );
              }}
            >
              <label>
                Rename selected cohort
                <input name="newCohortCode" defaultValue={selectedCohortCode ?? ""} />
              </label>
              <div className="admin-form-actions line-spread">
                <button type="submit" className="button-primary" disabled={Boolean(busy) || !selectedCohortCode}>
                  Rename Cohort
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={Boolean(busy) || !selectedCohortCode || !selectedSemesterKey}
                  onClick={async () => {
                    if (!selectedSemesterKey || !selectedCohortCode) {
                      return;
                    }

                    const confirmed = window.confirm(
                      `Xóa cohort ${selectedCohortCode}? Tất cả class group và schedule của cohort này sẽ bị xóa.`,
                    );
                    if (!confirmed) {
                      return;
                    }

                    await callApi(
                      "DELETE",
                      {
                        type: "cohort",
                        semesterKey: selectedSemesterKey,
                        cohortCode: selectedCohortCode,
                      },
                      "Đã xóa cohort.",
                    );
                  }}
                >
                  Delete Cohort
                </button>
              </div>
            </form>

            <form
              className="admin-form-grid mt-card"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!selectedSemesterKey || !selectedCohortCode) {
                  setError("Vui lòng chọn semester và cohort trước.");
                  return;
                }
                if (copyFromClassGroupName && !classGroups.some((classGroup) => classGroup.name === copyFromClassGroupName)) {
                  setError("Class group nguồn để copy không tồn tại trong cohort hiện tại.");
                  return;
                }

                const ok = await callApi(
                  "POST",
                  {
                    type: "classGroup",
                    semesterKey: selectedSemesterKey,
                    cohortCode: selectedCohortCode,
                    classGroupName: newClassGroupName,
                    copyFromClassGroupName: copyFromClassGroupName || null,
                  },
                  "Đã thêm class group.",
                );

                if (ok) {
                  setNewClassGroupName("");
                  const copiedEntries = ok.copiedEntries ?? 0;
                  const copiedTeachingAssignments = ok.copiedTeachingAssignments ?? 0;
                  if (copiedEntries > 0 || copiedTeachingAssignments > 0) {
                    setMessage(
                      `Đã thêm class group và copy ${copiedEntries} slot + ${copiedTeachingAssignments} phân công giảng dạy.`,
                    );
                  }
                }
              }}
            >
              <label>
                Add class group
                <input value={newClassGroupName} onChange={(event) => setNewClassGroupName(event.target.value)} placeholder="IT 04" />
              </label>
              <label>
                Copy từ class group (tuỳ chọn)
                <select value={copyFromClassGroupName} onChange={(event) => setCopyFromClassGroupName(event.target.value)}>
                  <option value="">Không copy</option>
                  {classGroups.map((classGroup) => (
                    <option key={classGroup.name} value={classGroup.name}>
                      {classGroup.name} ({classGroup.entryCount} slots)
                    </option>
                  ))}
                </select>
              </label>
              <div className="admin-form-actions">
                <button
                  type="submit"
                  className="button-primary"
                  disabled={Boolean(busy) || !selectedSemesterKey || !selectedCohortCode}
                >
                  Add Class Group
                </button>
              </div>
            </form>

            <form
              key={`class-group-edit-${selectedClassGroupName ?? "none"}`}
              className="admin-form-grid mt-card"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!selectedSemesterKey || !selectedCohortCode || !selectedClassGroupName) {
                  setError("Vui lòng chọn class group để đổi tên.");
                  return;
                }

                const formData = new FormData(event.currentTarget);
                await callApi(
                  "PATCH",
                  {
                    type: "classGroup",
                    semesterKey: selectedSemesterKey,
                    cohortCode: selectedCohortCode,
                    classGroupName: selectedClassGroupName,
                    newClassGroupName: String(formData.get("newClassGroupName") ?? ""),
                  },
                  "Đã cập nhật class group.",
                );
              }}
            >
              <label>
                Rename selected class group
                <input name="newClassGroupName" defaultValue={selectedClassGroupName ?? ""} />
              </label>
              <div className="admin-form-actions line-spread">
                <button type="submit" className="button-primary" disabled={Boolean(busy) || !selectedClassGroupName}>
                  Rename Class Group
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={Boolean(busy) || !selectedClassGroupName || !selectedSemesterKey || !selectedCohortCode}
                  onClick={async () => {
                    if (!selectedSemesterKey || !selectedCohortCode || !selectedClassGroupName) {
                      return;
                    }

                    const confirmed = window.confirm(
                      `Xóa class group ${selectedClassGroupName}? Toàn bộ schedule trong lớp này sẽ bị xóa.`,
                    );
                    if (!confirmed) {
                      return;
                    }

                    await callApi(
                      "DELETE",
                      {
                        type: "classGroup",
                        semesterKey: selectedSemesterKey,
                        cohortCode: selectedCohortCode,
                        classGroupName: selectedClassGroupName,
                      },
                      "Đã xóa class group.",
                    );
                  }}
                >
                  Delete Class Group
                </button>
              </div>
            </form>

            <div className="admin-table-wrap mt-card">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Class Groups</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((cohort) => (
                    <tr key={cohort.code} className={selectedCohortCode === cohort.code ? "admin-row-selected" : ""}>
                      <td>{cohort.code}</td>
                      <td>{cohort.classGroupCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="chip-row">
              {classGroups.map((classGroup) => (
                <span key={classGroup.name} className={`chip ${selectedClassGroupName === classGroup.name ? "chip-selected" : ""}`}>
                  {classGroup.name} ({classGroup.entryCount})
                </span>
              ))}
              {classGroups.length === 0 ? <span className="chip">Chưa có class group</span> : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "schedule" ? (
        <section className="admin-ops-grid">
          <article className="details-card admin-span-full admin-module-card">
            <header className="admin-section-heading">
              <h2>Timetable Editor</h2>
              <p className="muted-small">
                Scope hiện tại: {selectedSemesterKey ?? "N/A"} · {selectedCohortCode ?? "N/A"} · {selectedClassGroupName ?? "N/A"}
              </p>
            </header>

            <div className="admin-kpi-row">
              <span className="chip">Slots trong lớp đang chọn: {entries.length}</span>
              <span className="chip">Slots toàn cohort: {totalClassGroupEntries}</span>
              <span className="chip">Đang hiển thị: {filteredEntries.length}</span>
            </div>

            <form
              className="admin-form-grid admin-form-grid-wide"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!hasScope) {
                  setError("Vui lòng chọn semester/cohort/class group trước khi thêm ca học.");
                  return;
                }

                const ok = await callApi(
                  "POST",
                  {
                    type: "scheduleEntry",
                    semesterKey: selectedSemesterKey,
                    cohortCode: selectedCohortCode,
                    classGroupName: selectedClassGroupName,
                    courseCode: addCourseCode,
                    courseNameEn: addCourseNameEn || null,
                    courseNameVi: addCourseNameVi || null,
                    dayOfWeek: addDayOfWeek,
                    session: addSession,
                    startTime: addStartTime || null,
                    room: addRoom || null,
                    rawTime: addRawTime || null,
                    sourceSheet: "ADMIN_MANUAL",
                  },
                  "Đã thêm slot thời khóa biểu.",
                );

                if (ok) {
                  setAddCourseCode("");
                  setAddCourseNameEn("");
                  setAddCourseNameVi("");
                  setAddStartTime("");
                  setAddRoom("");
                  setAddRawTime("");
                }
              }}
            >
              <label>
                Course code
                <input
                  value={addCourseCode}
                  onChange={(event) => setAddCourseCode(event.target.value)}
                  placeholder="ENG 1102"
                  list="admin-course-options"
                />
              </label>
              <label>
                Course name (EN, optional)
                <input
                  value={addCourseNameEn}
                  onChange={(event) => setAddCourseNameEn(event.target.value)}
                  placeholder="Composition I"
                />
              </label>
              <label>
                Course name (VI, optional)
                <input
                  value={addCourseNameVi}
                  onChange={(event) => setAddCourseNameVi(event.target.value)}
                  placeholder="Tiếng Anh học thuật 1"
                />
              </label>
              <label>
                Day
                <select value={addDayOfWeek} onChange={(event) => setAddDayOfWeek(event.target.value as DayOfWeek)}>
                  {DAY_OPTIONS.map((day) => (
                    <option key={day} value={day}>
                      {day} · {DAY_LABEL[day]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session
                <select value={addSession} onChange={(event) => setAddSession(event.target.value as SessionPeriod)}>
                  {SESSION_OPTIONS.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start time (HH:MM)
                <input value={addStartTime} onChange={(event) => setAddStartTime(event.target.value)} placeholder="13:00" />
              </label>
              <label>
                Room
                <input value={addRoom} onChange={(event) => setAddRoom(event.target.value)} placeholder="B1-204 / IHAA" />
              </label>
              <label>
                Raw time note
                <input value={addRawTime} onChange={(event) => setAddRawTime(event.target.value)} placeholder="Period 7-9" />
              </label>
              <div className="admin-form-actions">
                <button type="submit" className="button-primary" disabled={Boolean(busy) || !hasScope}>
                  Add Schedule Entry
                </button>
              </div>
            </form>

            <div className="admin-entry-toolbar">
              <label>
                Lọc theo ngày
                <select value={entryFilterDay} onChange={(event) => setEntryFilterDay(event.target.value as DayOfWeek | "ALL")}>
                  {DAY_FILTER_OPTIONS.map((day) => (
                    <option key={day} value={day}>
                      {day === "ALL" ? "Tất cả ngày" : `${day} · ${DAY_LABEL[day]}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tìm nhanh theo môn/phòng/thời gian
                <input
                  value={entrySearch}
                  onChange={(event) => setEntrySearch(event.target.value)}
                  placeholder="VD: ENG 1102, IHAA, 13:00"
                />
              </label>
              <div className="admin-form-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setEntryFilterDay("ALL");
                    setEntrySearch("");
                  }}
                >
                  Reset Filter
                </button>
              </div>
            </div>

            <div className="admin-entry-day-grid">
              {groupedEntries.map(({ day, label, items }) => (
                <section key={day} className="admin-day-bucket">
                  <header className="admin-day-bucket-head">
                    <h3>
                      {day} · {label}
                    </h3>
                    <span>{items.length} slots</span>
                  </header>

                  {items.length === 0 ? <p className="empty-state">Không có slot trong bộ lọc hiện tại.</p> : null}

                  <div className="admin-entry-stack">
                    {items.map((entry) => (
                      <form
                        key={entry.id}
                        className="admin-entry-card"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const formData = new FormData(event.currentTarget);
                          await callApi(
                            "PATCH",
                            {
                              type: "scheduleEntry",
                              id: entry.id,
                              semesterKey: selectedSemesterKey,
                              cohortCode: selectedCohortCode,
                              classGroupName: String(formData.get("classGroupName") ?? selectedClassGroupName ?? ""),
                              courseCode: String(formData.get("courseCode") ?? entry.courseCode),
                              dayOfWeek: String(formData.get("dayOfWeek") ?? entry.dayOfWeek),
                              session: String(formData.get("session") ?? entry.session),
                              startTime: String(formData.get("startTime") ?? entry.startTime ?? ""),
                              room: String(formData.get("room") ?? entry.room ?? ""),
                              rawTime: String(formData.get("rawTime") ?? entry.rawTime ?? ""),
                            },
                            "Đã cập nhật slot.",
                          );
                        }}
                      >
                        <div className="admin-entry-card-head">
                          <div>
                            <strong>{entry.courseCode}</strong>
                            <p className="muted-small">{entry.courseNameVi ?? entry.courseNameEn ?? "No title"}</p>
                          </div>
                          <span className="chip">{entry.startTime ?? "TBA"}</span>
                        </div>

                        <div className="admin-entry-grid">
                          <label>
                            Course code
                            <input name="courseCode" defaultValue={entry.courseCode} list="admin-course-options" />
                          </label>
                          <label>
                            Class Group
                            <select name="classGroupName" defaultValue={selectedClassGroupName ?? ""}>
                              {classGroups.map((classGroup) => (
                                <option key={classGroup.name} value={classGroup.name}>
                                  {classGroup.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Day
                            <select name="dayOfWeek" defaultValue={entry.dayOfWeek}>
                              {DAY_OPTIONS.map((dayItem) => (
                                <option key={dayItem} value={dayItem}>
                                  {dayItem} · {DAY_LABEL[dayItem]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Session
                            <select name="session" defaultValue={entry.session}>
                              {SESSION_OPTIONS.map((session) => (
                                <option key={session} value={session}>
                                  {session}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Start time
                            <input name="startTime" defaultValue={entry.startTime ?? ""} placeholder="13:00" />
                          </label>
                          <label>
                            Room
                            <input name="room" defaultValue={entry.room ?? ""} placeholder="IHAA" />
                          </label>
                          <label className="admin-form-full">
                            Raw time note
                            <input name="rawTime" defaultValue={entry.rawTime ?? ""} placeholder="Period 7-9" />
                          </label>
                        </div>

                        <div className="admin-entry-actions">
                          <button type="submit" className="button-primary" disabled={Boolean(busy)}>
                            Save Slot
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={Boolean(busy)}
                            onClick={async () => {
                              const confirmed = window.confirm(
                                `Xóa slot ${entry.courseCode} ${entry.dayOfWeek} ${entry.startTime ?? "TBA"}?`,
                              );
                              if (!confirmed) {
                                return;
                              }

                              await callApi(
                                "DELETE",
                                {
                                  type: "scheduleEntry",
                                  id: entry.id,
                                },
                                "Đã xóa slot.",
                              );
                            }}
                          >
                            Delete Slot
                          </button>
                        </div>
                      </form>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <datalist id="admin-course-options">
        {courses.map((course) => (
          <option key={course.code} value={course.code}>
            {courseLabel(course)}
          </option>
        ))}
      </datalist>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
    </section>
  );
}
