"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LecturerAdminFormProps = {
  lecturerId: string;
  initial: {
    name: string;
    avatarUrl: string;
    title: string;
    department: string;
    email: string;
    office: string;
    profileUrl: string;
    bio: string;
  };
};

export function LecturerAdminForm({ lecturerId, initial }: LecturerAdminFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [title, setTitle] = useState(initial.title);
  const [department, setDepartment] = useState(initial.department);
  const [email, setEmail] = useState(initial.email);
  const [office, setOffice] = useState(initial.office);
  const [profileUrl, setProfileUrl] = useState(initial.profileUrl);
  const [bio, setBio] = useState(initial.bio);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function parseApiPayload(response: Response): Promise<{
    ok?: boolean;
    error?: string;
    avatarUrl?: string;
    stillVisibleFromSeed?: boolean;
    deletedTeachingAssignments?: number;
    deletedCourseOverrides?: number;
    unlinkedReviews?: number;
    deletedProfiles?: number;
  }> {
    const raw = await response.text();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw) as { ok?: boolean; error?: string; avatarUrl?: string };
    } catch {
      return {
        ok: false,
        error: raw.slice(0, 260),
      };
    }
  }

  async function onUploadAvatar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedFile) {
      setError("Vui lòng chọn một ảnh trước khi upload.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const response = await fetch(`/api/admin/lecturers/${encodeURIComponent(lecturerId)}/avatar`, {
        method: "POST",
        body: formData,
      });

      const payload = await parseApiPayload(response);

      if (!response.ok || !payload.ok || !payload.avatarUrl) {
        setError(payload.error ?? "Không thể upload ảnh giảng viên.");
        return;
      }

      setAvatarUrl(payload.avatarUrl);
      setSelectedFile(null);
      setMessage("Đã upload ảnh giảng viên thành công.");
    } catch {
      setError("Không kết nối được dịch vụ upload ảnh.");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/lecturers/${encodeURIComponent(lecturerId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          avatarUrl,
          title,
          department,
          email,
          office,
          profileUrl,
          bio,
        }),
      });

      const payload = await parseApiPayload(response);

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Không thể lưu hồ sơ giảng viên.");
        return;
      }

      setMessage("Đã lưu thông tin giảng viên thành công.");
    } catch {
      setError("Không kết nối được dịch vụ cập nhật giảng viên.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteLecturer() {
    const confirmed = window.confirm(
      "Xoá giảng viên này? Hệ thống sẽ xoá hồ sơ admin, phân công giảng dạy, override môn và gỡ liên kết review.",
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/lecturers/${encodeURIComponent(lecturerId)}`, {
        method: "DELETE",
      });

      const payload = await parseApiPayload(response);
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Không thể xóa giảng viên.");
        return;
      }

      if (payload.stillVisibleFromSeed) {
        setMessage(
          "Đã xóa dữ liệu admin/assignment của giảng viên. Hồ sơ này vẫn còn trong dữ liệu resources gốc.",
        );
        router.refresh();
        return;
      }

      router.push("/lecturers");
      router.refresh();
    } catch {
      setError("Không kết nối được dịch vụ xóa giảng viên.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-form-stack">
      <form className="admin-form-grid" onSubmit={onSubmit}>
        <label>
          Tên hiển thị
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên hiển thị giảng viên" />
        </label>

        <label>
          URL ảnh đại diện
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://... hoặc /uploads/lecturers/..."
          />
        </label>

        <label>
          Học hàm/Học vị
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Professor, Dr, MSc..." />
        </label>

        <label>
          Khoa/Viện
          <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="School / Department" />
        </label>

        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.edu" />
        </label>

        <label>
          Phòng làm việc
          <input value={office} onChange={(event) => setOffice(event.target.value)} placeholder="Room, building, campus" />
        </label>

        <label>
          URL hồ sơ
          <input
            value={profileUrl}
            onChange={(event) => setProfileUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>

        <label className="admin-form-full">
          Mô tả
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={5}
            placeholder="Mô tả ngắn về giảng viên và định hướng giảng dạy"
          />
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu thông tin giảng viên"}
          </button>
        </div>
      </form>

      <form className="admin-form-grid" onSubmit={onUploadAvatar}>
        <label className="admin-form-full">
          Upload ảnh từ máy
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
            }}
          />
        </label>
        <div className="admin-form-actions">
          <button type="submit" className="button-secondary" disabled={uploading}>
            {uploading ? "Đang upload..." : "Upload ảnh đại diện"}
          </button>
        </div>
      </form>

      <div className="warning-card">
        <h2>Danger Zone</h2>
        <p className="muted-small">
          Dùng khi tạo nhầm giảng viên. Thao tác sẽ xóa dữ liệu quản trị liên quan đến giảng viên này.
        </p>
        <button type="button" className="button-danger" disabled={deleting} onClick={() => void onDeleteLecturer()}>
          {deleting ? "Đang xoá..." : "Xoá giảng viên"}
        </button>
      </div>

      {avatarUrl ? (
        <div className="lecturer-avatar-preview">
          <p className="muted-small">Xem trước ảnh đại diện:</p>
          <img src={avatarUrl} alt={`Ảnh giảng viên ${name || lecturerId}`} />
        </div>
      ) : null}

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
    </div>
  );
}
