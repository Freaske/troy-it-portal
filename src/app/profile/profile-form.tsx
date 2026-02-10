"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ProfileFormProps = {
  initial: {
    username: string;
    role: string;
    email: string | null;
    displayName: string;
    cohortCode: string | null;
    classGroupName: string | null;
    studentCode: string | null;
    preferredLanguage: "VI" | "EN" | "JA";
  };
};

type ProfileResponse = {
  ok?: boolean;
  error?: string;
};

export function ProfileForm({ initial }: ProfileFormProps) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [cohortCode, setCohortCode] = useState(initial.cohortCode ?? "");
  const [classGroupName, setClassGroupName] = useState(initial.classGroupName ?? "");
  const [studentCode, setStudentCode] = useState(initial.studentCode ?? "");
  const [preferredLanguage, setPreferredLanguage] = useState<"VI" | "EN" | "JA">(initial.preferredLanguage ?? "VI");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isStudent = initial.role === "STUDENT";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          email: email || null,
          cohortCode: cohortCode || null,
          classGroupName: classGroupName || null,
          studentCode: studentCode || null,
          preferredLanguage,
        }),
      });

      const payload = (await response.json()) as ProfileResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Không thể lưu hồ sơ.");
        return;
      }

      setMessage("Đã cập nhật hồ sơ thành công.");
      router.refresh();
    } catch {
      setError("Không kết nối được dịch vụ hồ sơ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form-grid" onSubmit={onSubmit}>
      <label>
        Tên đăng nhập
        <input value={initial.username} readOnly />
      </label>

      <label>
        Vai trò
        <input value={initial.role} readOnly />
      </label>

      <label>
        Tên hiển thị
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      </label>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={isStudent ? "abc123@sis.hust.edu.vn" : "your email"}
        />
      </label>

      <label>
        Khóa
        <input
          value={cohortCode}
          onChange={(event) => setCohortCode(event.target.value)}
          placeholder="K69"
          disabled={!isStudent}
        />
      </label>

      <label>
        Lớp
        <input
          value={classGroupName}
          onChange={(event) => setClassGroupName(event.target.value)}
          placeholder="IT 01"
          disabled={!isStudent}
        />
      </label>

      <label className="admin-form-full">
        Mã số sinh viên
        <input
          value={studentCode}
          onChange={(event) => setStudentCode(event.target.value)}
          placeholder="2026xxxx"
          disabled={!isStudent}
        />
      </label>

      <label className="admin-form-full">
        Ngôn ngữ giao diện
        <select
          value={preferredLanguage}
          onChange={(event) => setPreferredLanguage(event.target.value as "VI" | "EN" | "JA")}
        >
          <option value="VI">Tiếng Việt</option>
          <option value="EN">English</option>
          <option value="JA">日本語</option>
        </select>
      </label>

      <div className="admin-form-actions">
        <button type="submit" className="button-primary" disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu thiết lập"}
        </button>
      </div>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
    </form>
  );
}
