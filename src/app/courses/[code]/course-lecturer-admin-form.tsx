"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type LecturerItem = {
  id: string;
  name: string;
};

type TeachingAssignmentItem = {
  id: string;
  classGroupName: string | null;
  instructionCode: string | null;
  lecturerId: string;
  lecturerName: string;
  updatedAt: string;
};

type CourseLecturerAdminFormProps = {
  courseCode: string;
  semesterKey: string;
  currentLecturers: LecturerItem[];
  allLecturers: LecturerItem[];
  teachingAssignments: TeachingAssignmentItem[];
  classGroupOptions: string[];
  instructionCodeOptions: string[];
};

type ApiPayload = {
  ok?: boolean;
  error?: string;
};

type ScopePayload = {
  classGroupName?: string | null;
  instructionCode?: string | null;
};

function buildLecturerId(raw: string): string {
  const normalized = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized.slice(0, 120);
}

function normalizeClassGroup(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeInstructionCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function scopeSummary(scope: ScopePayload): string {
  const classGroup = scope.classGroupName?.trim() ?? "";
  const instructionCode = scope.instructionCode?.trim() ?? "";

  if (!classGroup && !instructionCode) {
    return "toàn bộ lớp + toàn bộ mã";
  }

  if (classGroup && instructionCode) {
    return `lớp ${classGroup} + mã ${instructionCode}`;
  }

  if (classGroup) {
    return `lớp ${classGroup} (mọi mã)`;
  }

  return `mọi lớp + mã ${instructionCode}`;
}

export function CourseLecturerAdminForm({
  courseCode,
  semesterKey,
  currentLecturers,
  allLecturers,
  teachingAssignments,
  classGroupOptions,
  instructionCodeOptions,
}: CourseLecturerAdminFormProps) {
  const router = useRouter();
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [newLecturerName, setNewLecturerName] = useState("");
  const [newLecturerId, setNewLecturerId] = useState("");
  const [classGroupName, setClassGroupName] = useState("");
  const [instructionCode, setInstructionCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedLecturers = useMemo(
    () => [...allLecturers].sort((a, b) => a.name.localeCompare(b.name)),
    [allLecturers],
  );

  const normalizedScope = useMemo(
    () => ({
      classGroupName: normalizeClassGroup(classGroupName) || null,
      instructionCode: normalizeInstructionCode(instructionCode) || null,
    }),
    [classGroupName, instructionCode],
  );

  async function addLecturer(payload: { lecturerId: string; lecturerName?: string } & ScopePayload) {
    if (!semesterKey) {
      setError("Vui lòng chọn học kỳ trước khi gán giảng viên.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/course-lecturers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseCode,
          semesterKey,
          lecturerId: payload.lecturerId,
          lecturerName: payload.lecturerName,
          classGroupName: payload.classGroupName ?? null,
          instructionCode: payload.instructionCode ?? null,
        }),
      });

      const body = (await response.json()) as ApiPayload;
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Không thể gán giảng viên vào học phần.");
        return;
      }

      setMessage(`Đã gán giảng viên theo phạm vi: ${scopeSummary(payload)}.`);
      setSelectedExistingId("");
      setNewLecturerId("");
      setNewLecturerName("");
      router.refresh();
    } catch {
      setError("Không kết nối được dịch vụ giảng viên-học phần.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLecturer(payload: { lecturerId: string } & ScopePayload) {
    if (!semesterKey) {
      setError("Vui lòng chọn học kỳ trước khi bỏ phân công.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/course-lecturers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseCode,
          semesterKey,
          lecturerId: payload.lecturerId,
          classGroupName: payload.classGroupName ?? null,
          instructionCode: payload.instructionCode ?? null,
        }),
      });

      const body = (await response.json()) as ApiPayload;
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Không thể bỏ giảng viên khỏi học phần.");
        return;
      }

      setMessage(`Đã bỏ gán giảng viên ở phạm vi: ${scopeSummary(payload)}.`);
      router.refresh();
    } catch {
      setError("Không kết nối được dịch vụ giảng viên-học phần.");
    } finally {
      setBusy(false);
    }
  }

  async function onAddExisting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedExistingId) {
      setError("Vui lòng chọn giảng viên.");
      return;
    }

    await addLecturer({
      lecturerId: selectedExistingId,
      ...normalizedScope,
    });
  }

  async function onAddNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newLecturerName.trim();
    if (!name) {
      setError("Vui lòng nhập tên giảng viên mới.");
      return;
    }

    const resolvedId = buildLecturerId(newLecturerId || name);
    if (!resolvedId) {
      setError("Mã giảng viên không hợp lệ.");
      return;
    }

    await addLecturer({
      lecturerId: resolvedId,
      lecturerName: name,
      ...normalizedScope,
    });
  }

  return (
    <div className="admin-form-stack">
      <div>
        <h3>Giảng viên toàn môn (không lọc lớp/IH)</h3>
        {currentLecturers.length === 0 ? (
          <p className="muted-small">Chưa có giảng viên được gán.</p>
        ) : (
          <ul className="simple-list">
            {currentLecturers.map((lecturer) => (
              <li key={lecturer.id} className="line-spread">
                <span>
                  {lecturer.name} <code>{lecturer.id}</code>
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => removeLecturer({ lecturerId: lecturer.id })}
                  disabled={busy}
                >
                  Bỏ toàn môn
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Phân công theo lớp / mã IH (IHAA, IHAB...)</h3>
        {teachingAssignments.length === 0 ? (
          <p className="muted-small">Chưa có phân công scoped. Có thể tạo bên dưới.</p>
        ) : (
          <ul className="simple-list">
            {teachingAssignments.map((assignment) => (
              <li key={assignment.id} className="line-spread">
                <span>
                  {assignment.lecturerName} <code>{assignment.lecturerId}</code> · lớp{" "}
                  <strong>{assignment.classGroupName ?? "ALL"}</strong> · mã{" "}
                  <strong>{assignment.instructionCode ?? "ALL"}</strong>
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() =>
                    removeLecturer({
                      lecturerId: assignment.lecturerId,
                      classGroupName: assignment.classGroupName,
                      instructionCode: assignment.instructionCode,
                    })
                  }
                  disabled={busy}
                >
                  Bỏ scoped
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-form-grid">
        <label>
          Lớp áp dụng (optional)
          <input
            value={classGroupName}
            onChange={(event) => setClassGroupName(event.target.value)}
            placeholder="IT 01"
            list="course-class-group-options"
          />
          <datalist id="course-class-group-options">
            {classGroupOptions.map((option) => (
              <option value={option} key={option} />
            ))}
          </datalist>
        </label>

        <label>
          Mã instruction (optional)
          <input
            value={instructionCode}
            onChange={(event) => setInstructionCode(event.target.value)}
            placeholder="IHAA"
            list="course-instruction-options"
          />
          <datalist id="course-instruction-options">
            {instructionCodeOptions.map((option) => (
              <option value={option} key={option} />
            ))}
          </datalist>
        </label>
      </div>

      <p className="muted-small">
        Phạm vi hiện tại: <strong>{scopeSummary(normalizedScope)}</strong>. Để trống cả 2 ô nghĩa là gán toàn môn.
      </p>

      <form className="admin-form-grid" onSubmit={onAddExisting}>
        <label className="admin-form-full">
          Gán giảng viên có sẵn
          <select value={selectedExistingId} onChange={(event) => setSelectedExistingId(event.target.value)}>
            <option value="">Chọn giảng viên</option>
            {sortedLecturers.map((lecturer) => (
              <option key={lecturer.id} value={lecturer.id}>
                {lecturer.name} ({lecturer.id})
              </option>
            ))}
          </select>
        </label>
        <div className="admin-form-actions">
          <button type="submit" className="button-primary" disabled={busy || sortedLecturers.length === 0}>
            {busy ? "Đang cập nhật..." : "Gán giảng viên có sẵn"}
          </button>
        </div>
      </form>

      <form className="admin-form-grid" onSubmit={onAddNew}>
        <label>
          Tên giảng viên mới
          <input
            value={newLecturerName}
            onChange={(event) => setNewLecturerName(event.target.value)}
            placeholder="TS. Nguyễn Văn B"
          />
        </label>
        <label>
          Mã giảng viên mới (không bắt buộc)
          <input
            value={newLecturerId}
            onChange={(event) => setNewLecturerId(event.target.value)}
            placeholder="nguyen-van-b"
          />
        </label>
        <div className="admin-form-actions">
          <button type="submit" className="button-primary" disabled={busy}>
            {busy ? "Đang cập nhật..." : "Tạo mới và gán giảng viên"}
          </button>
        </div>
      </form>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
    </div>
  );
}
