import { DayOfWeek } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAcademicBundle } from "@/lib/academic-data";
import { getUserProfile } from "@/lib/auth/accounts";
import { getServerSession, type UserRole } from "@/lib/auth/session";
import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n";
import { DAY_OPTIONS, ORDERED_DAYS, getPortalData } from "@/lib/portal";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ScheduleView = "matrix" | "agenda" | "cards";

function pickSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isDayValue(value: string | undefined): value is DayOfWeek | "ALL" {
  if (!value) {
    return false;
  }

  if (value === "ALL") {
    return true;
  }

  return Object.values(DayOfWeek).includes(value as DayOfWeek);
}

function isScheduleView(value: string | undefined): value is ScheduleView {
  return value === "matrix" || value === "agenda" || value === "cards";
}

function allowedViewsForRole(role: UserRole): ScheduleView[] {
  if (role === "ADMIN") {
    return ["matrix", "agenda", "cards"];
  }

  if (role === "LECTURER") {
    return ["matrix", "agenda"];
  }

  return ["agenda"];
}

function sessionLabel(raw: string, language: UiLanguage): string {
  if (language === "JA") {
    if (raw === "MORNING") {
      return "午前";
    }
    if (raw === "AFTERNOON") {
      return "午後";
    }
    if (raw === "EVENING") {
      return "夜";
    }
    return "未定";
  }

  if (language === "VI") {
    if (raw === "MORNING") {
      return "Sáng";
    }
    if (raw === "AFTERNOON") {
      return "Chiều";
    }
    if (raw === "EVENING") {
      return "Tối";
    }
    return "Chưa rõ";
  }

  if (raw === "MORNING") {
    return "Morning";
  }
  if (raw === "AFTERNOON") {
    return "Afternoon";
  }
  if (raw === "EVENING") {
    return "Evening";
  }
  return "Unknown";
}

function roleHeading(role: UserRole, language: UiLanguage): string {
  if (language === "JA") {
    if (role === "ADMIN") {
      return "学務運用コントロール";
    }
    if (role === "LECTURER") {
      return "教員向け授業ワークスペース";
    }

    return "学生向け個人時間割";
  }

  if (language === "VI") {
    if (role === "ADMIN") {
      return "Trung tâm điều hành học vụ";
    }
    if (role === "LECTURER") {
      return "Không gian giảng dạy cho giảng viên";
    }

    return "Thời khóa biểu cá nhân sinh viên";
  }

  if (role === "ADMIN") {
    return "Operations Control (Admin)";
  }
  if (role === "LECTURER") {
    return "Faculty Teaching Workspace";
  }

  return "Student Personal Timetable";
}

function roleDescription(role: UserRole, language: UiLanguage): string {
  if (language === "JA") {
    if (role === "ADMIN") {
      return "コホート／クラス別の全体管理、衝突検出、学期データの同期を一元管理します。";
    }
    if (role === "LECTURER") {
      return "学期ベースで matrix/agenda を確認し、授業資料と講義情報へ素早くアクセスできます。";
    }

    return "プロフィール（学年・クラス）に基づく時間割と、授業レビュー・学習資料を統合表示します。";
  }

  if (language === "VI") {
    if (role === "ADMIN") {
      return "Toàn quyền theo dõi theo khóa/lớp, phát hiện trùng lịch và quản lý đồng bộ dữ liệu học kỳ.";
    }
    if (role === "LECTURER") {
      return "Tập trung theo học kỳ, xem matrix/agenda và truy cập nhanh học liệu cùng thông tin giảng dạy.";
    }

    return "Xem lịch học theo hồ sơ cá nhân (khóa/lớp), đánh giá học phần và theo dõi học liệu nhanh chóng.";
  }

  if (role === "ADMIN") {
    return "Full scope by cohort/class, conflict tracking, and semester data synchronization controls.";
  }
  if (role === "LECTURER") {
    return "Semester-focused matrix/agenda views with quick access to teaching resources and course information.";
  }

  return "Personalized timetable by profile (cohort/class), with course reviews and resource tracking.";
}

function toMinutes(value: string): number {
  const matched = value.match(/(\d{1,2}):(\d{2})/);
  if (!matched) {
    return Number.POSITIVE_INFINITY;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return Number.POSITIVE_INFINITY;
  }

  return hour * 60 + minute;
}

function sortTimeSlots(a: string, b: string): number {
  const delta = toMinutes(a) - toMinutes(b);
  if (delta !== 0) {
    return delta;
  }

  return a.localeCompare(b);
}

export default async function Home({ searchParams }: HomeProps) {
  const query = await searchParams;
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const role = session.role;
  const profile =
    role === "STUDENT" && session.userId ? await getUserProfile(session.username, session.role) : null;
  const language = normalizeUiLanguage(profile?.preferredLanguage ?? session.language, "VI");
  const canManageScope = role === "ADMIN";
  const canSelectSemester = role !== "STUDENT";
  const canManageImport = role === "ADMIN";
  const selectedDayParam = pickSingle(query.day);
  const selectedDay = isDayValue(selectedDayParam) ? selectedDayParam : "ALL";
  const allowedViews = allowedViewsForRole(role);
  const requestedView = pickSingle(query.view);
  const selectedView =
    isScheduleView(requestedView) && allowedViews.includes(requestedView)
      ? requestedView
      : role === "ADMIN"
        ? "cards"
        : role === "LECTURER"
          ? "matrix"
          : "agenda";

  const enforcedStudentCohort = role === "STUDENT" ? profile?.cohortCode ?? session.cohortCode ?? undefined : undefined;
  const enforcedStudentClass =
    role === "STUDENT" ? profile?.classGroupName ?? session.classGroupName ?? undefined : undefined;

  const portalData = await getPortalData({
    semesterKey: canSelectSemester ? pickSingle(query.semester) : undefined,
    cohortCode: canManageScope ? pickSingle(query.cohort) : enforcedStudentCohort,
    classGroupName: canManageScope ? pickSingle(query.classGroup) : enforcedStudentClass,
    day: selectedDay,
  });

  const knowledge = await getAcademicBundle();

  const selectedSemester = portalData.meta.semesters.find(
    (semester) => semester.key === portalData.selected.semesterKey,
  );

  const selectedCohort = selectedSemester?.cohorts.find(
    (cohort) => cohort.code === portalData.selected.cohortCode,
  );

  const dayList =
    portalData.selected.day === "ALL"
      ? ORDERED_DAYS.slice(0, 6)
      : ORDERED_DAYS.filter((day) => day === portalData.selected.day);

  const entriesByDay = new Map<DayOfWeek, typeof portalData.entries>();
  for (const day of dayList) {
    entriesByDay.set(
      day,
      portalData.entries.filter((entry) => entry.dayOfWeek === day),
    );
  }

  const sessionBreakdown = {
    morning: portalData.entries.filter((entry) => entry.session === "MORNING").length,
    afternoon: portalData.entries.filter((entry) => entry.session === "AFTERNOON").length,
    evening: portalData.entries.filter((entry) => entry.session === "EVENING").length,
  };

  const distinctCourseCount = new Set(portalData.entries.map((entry) => entry.course.code)).size;
  const creditsLabel =
    portalData.entries.length > 0
      ? language === "VI"
        ? `${portalData.entries.length} ca trong bộ lọc`
        : language === "JA"
          ? `表示中 ${portalData.entries.length} コマ`
          : `${portalData.entries.length} slots in view`
      : language === "VI"
        ? "Không có ca học"
        : language === "JA"
          ? "授業コマなし"
          : "No slots";
  const deniedAdmin = pickSingle(query.denied) === "admin";

  const timeSlots = [...new Set(portalData.entries.map((entry) => entry.startTime ?? entry.rawTime ?? "TBA"))].sort(
    sortTimeSlots,
  );

  type PortalEntry = (typeof portalData.entries)[number];

  const matrixBySlot = new Map<string, Map<DayOfWeek, PortalEntry[]>>();
  for (const slot of timeSlots) {
    const dayMap = new Map<DayOfWeek, PortalEntry[]>();
    for (const day of dayList) {
      dayMap.set(day, []);
    }
    matrixBySlot.set(slot, dayMap);
  }

  for (const entry of portalData.entries) {
    if (!dayList.includes(entry.dayOfWeek)) {
      continue;
    }

    const slotKey = entry.startTime ?? entry.rawTime ?? "TBA";
    const dayMap = matrixBySlot.get(slotKey);
    const dayEntries = dayMap?.get(entry.dayOfWeek);

    if (dayEntries) {
      dayEntries.push(entry);
    }
  }

  const filterGridClass = canManageScope ? "filter-grid" : role === "LECTURER" ? "filter-grid-lecturer" : "filter-grid-student";
  const selectedSemesterQuery = portalData.selected.semesterKey
    ? `?semester=${encodeURIComponent(portalData.selected.semesterKey)}`
    : "";

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">HUST-Troy Academic Dashboard</p>
        <h1>
          {language === "VI"
            ? "Trung tâm điều phối thời khóa biểu"
            : language === "JA"
              ? "統合タイムテーブル運用センター"
              : "Integrated Timetable Operations Center"}
        </h1>
        <p>
          {roleHeading(role, language)} · {roleDescription(role, language)}
        </p>
        <div className="chip-row">
          <span className="chip">
            {language === "VI" ? "Vai trò" : language === "JA" ? "ロール" : "Role"}: {role}
          </span>
          <Link href="/courses" className="chip link-chip">
            {knowledge.stats.courses} courses
          </Link>
          {role === "STUDENT" ? (
            <span className="chip">{knowledge.stats.lecturers} lecturers</span>
          ) : (
            <Link href="/lecturers" className="chip link-chip">
              {knowledge.stats.lecturers} lecturers
            </Link>
          )}
          <span className="chip">{knowledge.stats.reviews} comments</span>
          <span className="chip">{distinctCourseCount} courses in schedule</span>
          <span className="chip">{creditsLabel}</span>
        </div>
      </section>

      {deniedAdmin ? <p className="status-error">Tài khoản của bạn không có quyền truy cập khu vực quản trị.</p> : null}

      {role !== "STUDENT" ? (
        <section className="course-grid">
          <article className="course-card">
            <div className="course-top">
              <strong>Morning</strong>
              <span>{sessionBreakdown.morning}</span>
            </div>
            <p className="muted-small">Số ca buổi sáng trong bộ lọc hiện tại.</p>
          </article>
          <article className="course-card">
            <div className="course-top">
              <strong>Afternoon</strong>
              <span>{sessionBreakdown.afternoon}</span>
            </div>
            <p className="muted-small">Số ca buổi chiều trong bộ lọc hiện tại.</p>
          </article>
          <article className="course-card">
            <div className="course-top">
              <strong>Evening</strong>
              <span>{sessionBreakdown.evening}</span>
            </div>
            <p className="muted-small">Theo dõi các lớp tối hoặc giờ học chưa công bố.</p>
          </article>
        </section>
      ) : (
        <section className="details-card student-summary-card">
          <h2>Tổng quan lịch học</h2>
          <p>
            Hôm nay bạn có <strong>{portalData.entries.length}</strong> ca theo bộ lọc hiện tại, gồm{" "}
            <strong>{distinctCourseCount}</strong> môn.
          </p>
          <div className="chip-row">
            <span className="chip">Sáng: {sessionBreakdown.morning}</span>
            <span className="chip">Chiều: {sessionBreakdown.afternoon}</span>
            <span className="chip">Tối: {sessionBreakdown.evening}</span>
          </div>
        </section>
      )}

      <section className="controls-card">
        <form className={filterGridClass} method="GET">
          {canManageScope ? (
            <>
              <label>
                Semester
                <select name="semester" defaultValue={portalData.selected.semesterKey ?? ""}>
                  {portalData.meta.semesters.map((semester) => (
                    <option key={semester.key} value={semester.key}>
                      {semester.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cohort
                <select name="cohort" defaultValue={portalData.selected.cohortCode ?? ""}>
                  {(selectedSemester?.cohorts ?? []).map((cohort) => (
                    <option key={cohort.code} value={cohort.code}>
                      {cohort.code}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Class Group
                <select name="classGroup" defaultValue={portalData.selected.classGroupName ?? ""}>
                  {(selectedCohort?.classGroups ?? []).map((classGroup) => (
                    <option key={classGroup} value={classGroup}>
                      {classGroup}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : role === "LECTURER" ? (
            <>
              <label>
                Semester
                <select name="semester" defaultValue={portalData.selected.semesterKey ?? ""}>
                  {portalData.meta.semesters.map((semester) => (
                    <option key={semester.key} value={semester.key}>
                      {semester.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="scope-lock">
                <strong>Lecturer scope</strong>
                <p>
                  Chế độ giảng viên được tối ưu để theo dõi tổng quan theo học kỳ. Cohort/class hiển thị theo dữ liệu
                  hệ thống.
                </p>
              </div>
            </>
          ) : (
            <div className="scope-lock">
              <strong>Student scope</strong>
              <p>
                Bạn đang xem theo hồ sơ cá nhân: {portalData.selected.cohortCode ?? "N/A"} ·{" "}
                {portalData.selected.classGroupName ?? "N/A"}. Sửa tại <Link href="/profile">Profile Settings</Link>.
              </p>
            </div>
          )}

          <label>
            Day
            <select name="day" defaultValue={portalData.selected.day}>
              {DAY_OPTIONS.map((dayOption) => (
                <option key={dayOption.value} value={dayOption.value}>
                  {dayOption.label}
                </option>
              ))}
            </select>
          </label>

          {allowedViews.length > 1 ? (
            <label>
              View mode
              <select name="view" defaultValue={selectedView}>
                {allowedViews.map((viewOption) => (
                  <option key={viewOption} value={viewOption}>
                    {viewOption === "matrix" ? "Matrix" : viewOption === "agenda" ? "Agenda" : "Cards"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button type="submit" className="button-primary">
            Apply Filters
          </button>
        </form>

        <p className="hint-text">
          {canManageImport ? (
            <>
              Quản trị viên có thể đồng bộ Excel tại <Link href="/admin/import">Admin Import</Link> và chỉnh trực
              tiếp học vụ tại <Link href="/admin/academic">Academic Management</Link>. Xem thêm{" "}
              <Link href="/courses">Course Catalog</Link>, <Link href="/lecturers">Faculty Ratings</Link> và{" "}
              <Link href="/resources">Resource Hub</Link>.
            </>
          ) : role === "STUDENT" ? (
            <>
              Gợi ý cho sinh viên: mở <Link href="/courses">Course Catalog</Link> để xem chi tiết môn,{" "}
              <Link href="/lecturers">Faculty</Link> để xem giảng viên theo kỳ, và <Link href="/profile">Profile</Link>{" "}
              để cập nhật khóa/lớp.
            </>
          ) : (
            <>
              Tài khoản {role.toLowerCase()} không có quyền import dữ liệu. Bạn vẫn có thể truy cập{" "}
              <Link href="/courses">Course Catalog</Link>, <Link href="/resources">Resource Hub</Link>,{" "}
              <Link href="/lecturers">Faculty Ratings</Link> và <Link href="/profile">Profile Settings</Link>.
            </>
          )}
        </p>
      </section>

      {canManageImport && portalData.conflicts.length > 0 ? (
        <section className="warning-card">
          <h2>Cảnh báo trùng lịch</h2>
          <ul>
            {portalData.conflicts.map((conflict) => (
              <li key={`${conflict.dayOfWeek}-${conflict.startTime}`}>
                {conflict.dayOfWeek} {conflict.startTime}: {conflict.courses.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="details-card schedule-shell">
        <div className="schedule-head">
          <h2>
            {selectedView === "matrix"
              ? "Weekly Matrix"
              : selectedView === "agenda"
                ? "Daily Agenda"
                : "Cards by Day"}
          </h2>
          <p>
            {selectedView === "matrix"
              ? "Xem nhanh theo khung giờ × ngày để tránh trùng lịch."
              : selectedView === "agenda"
                ? "Danh sách theo từng ngày, phù hợp theo dõi chi tiết."
                : "Dạng thẻ theo ngày, phù hợp quan sát tổng quan."}
          </p>
        </div>

        {portalData.entries.length === 0 ? (
          <p className="empty-state">Không có lớp học trong bộ lọc hiện tại.</p>
        ) : null}

        {portalData.entries.length > 0 && selectedView === "matrix" ? (
          <div className="matrix-scroll">
            <table className="schedule-matrix">
              <thead>
                <tr>
                  <th className="matrix-time-col">Time</th>
                  {dayList.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={slot}>
                    <th className="matrix-time-col">{slot}</th>
                    {dayList.map((day) => {
                      const entries = matrixBySlot.get(slot)?.get(day) ?? [];

                      return (
                        <td key={`${slot}-${day}`}>
                          {entries.length === 0 ? (
                            <span className="matrix-empty">-</span>
                          ) : (
                            <div className="matrix-cell-stack">
                              {entries.map((entry) => (
                                <Link
                                  key={entry.id}
                                  href={`/courses/${encodeURIComponent(entry.course.code)}${selectedSemesterQuery}`}
                                  className="matrix-chip"
                                >
                                  <strong>{entry.course.code}</strong>
                                  <span>
                                    {entry.room ?? "TBA"} · {sessionLabel(entry.session, language)}
                                  </span>
                                  {entry.instructionCode ? <span>Mã: {entry.instructionCode}</span> : null}
                                  {entry.lecturers.length > 0 ? (
                                    <span>GV: {entry.lecturers.map((lecturer) => lecturer.name).join(", ")}</span>
                                  ) : null}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {portalData.entries.length > 0 && selectedView === "agenda" ? (
          <div className="agenda-grid">
            {dayList.map((day) => {
              const entries = entriesByDay.get(day) ?? [];

              return (
                <article key={day} className="agenda-day">
                  <header>
                    <h3>{day}</h3>
                    <span>{entries.length} ca</span>
                  </header>

                  {entries.length === 0 ? (
                    <p className="empty-state">Không có lớp học.</p>
                  ) : (
                    <ul className="agenda-list">
                      {entries.map((entry) => (
                        <li key={entry.id} className="agenda-item">
                          <div className="agenda-item-head">
                            <strong>
                              <Link href={`/courses/${encodeURIComponent(entry.course.code)}${selectedSemesterQuery}`}>
                                {entry.course.code}
                              </Link>
                            </strong>
                            <span>{entry.startTime ?? "TBA"}</span>
                          </div>
                          <p>{entry.course.nameEn ?? entry.course.nameVi ?? "Chưa cập nhật tên môn"}</p>
                          <p>
                            {entry.room ?? "Phòng TBA"} · {sessionLabel(entry.session, language)}
                          </p>
                          {entry.instructionCode ? <p>Mã instruction: {entry.instructionCode}</p> : null}
                          <p>
                            Giảng viên:{" "}
                            {entry.lecturers.length > 0
                              ? entry.lecturers.map((lecturer) => lecturer.name).join(", ")
                              : "Chưa phân công"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}

        {portalData.entries.length > 0 && selectedView === "cards" ? (
          <div className="grid-board">
            {dayList.map((day) => {
              const entries = entriesByDay.get(day) ?? [];

              return (
                <article key={day} className="day-column">
                  <header>
                    <h3>{day}</h3>
                    <span>{entries.length} ca học</span>
                  </header>

                  {entries.length === 0 ? (
                    <p className="empty-state">Không có lớp học.</p>
                  ) : (
                    <ul>
                      {entries.map((entry) => (
                        <li key={entry.id} className="slot-card">
                          <div className="slot-head">
                            <strong>
                              <Link href={`/courses/${encodeURIComponent(entry.course.code)}${selectedSemesterQuery}`}>
                                {entry.course.code}
                              </Link>
                            </strong>
                            <span>{entry.startTime ?? "TBA"}</span>
                          </div>
                          <p>{entry.course.nameEn ?? entry.course.nameVi ?? "Chưa cập nhật tên môn"}</p>
                          <p>{sessionLabel(entry.session, language)}</p>
                          <p>{entry.room ?? "Phòng TBA"}</p>
                          {entry.instructionCode ? <p>Mã instruction: {entry.instructionCode}</p> : null}
                          <p>
                            Giảng viên:{" "}
                            {entry.lecturers.length > 0
                              ? entry.lecturers.map((lecturer) => lecturer.name).join(", ")
                              : "Chưa phân công"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
