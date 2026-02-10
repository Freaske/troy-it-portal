"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RequestCodeResponse = {
  ok?: boolean;
  error?: string;
  email?: string;
  expiresAt?: string;
  devCode?: string;
  message?: string;
};

type VerifyResponse = {
  ok?: boolean;
  error?: string;
  username?: string;
  message?: string;
};

type RegisterStep = "FORM" | "VERIFY";

function formatExpiry(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("vi-VN");
}

export function RegisterForm() {
  const router = useRouter();

  const [step, setStep] = useState<RegisterStep>("FORM");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cohortCode, setCohortCode] = useState("");
  const [classGroupName, setClassGroupName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestVerificationCode() {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
        cohortCode,
        classGroupName,
        studentCode,
      }),
    });

    const payload = (await response.json()) as RequestCodeResponse;
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: payload.error ?? "Không thể gửi mã xác minh.",
      } as const;
    }

    return {
      ok: true,
      payload,
    } as const;
  }

  async function onSubmitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    if (!email.toLowerCase().endsWith("@sis.hust.edu.vn")) {
      setError("Chỉ cho phép email @sis.hust.edu.vn.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Mật khẩu tối thiểu 8 ký tự.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      setLoading(false);
      return;
    }

    try {
      const requested = await requestVerificationCode();
      if (!requested.ok) {
        setError(requested.error);
        return;
      }

      const normalizedEmail = requested.payload.email ?? email.trim().toLowerCase();
      setVerificationEmail(normalizedEmail);
      setExpiresAt(requested.payload.expiresAt ?? null);
      setStep("VERIFY");
      setMessage(
        `${requested.payload.message ?? "Đã gửi mã xác minh đến email."}${
          requested.payload.devCode ? ` [DEV CODE: ${requested.payload.devCode}]` : ""
        }`,
      );
    } catch {
      setError("Không kết nối được dịch vụ đăng ký.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifying(true);
    setMessage(null);
    setError(null);

    const code = verificationCode.trim().replace(/\s+/g, "");
    if (!verificationEmail || !code) {
      setError("Vui lòng nhập đầy đủ email và mã xác minh.");
      setVerifying(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: verificationEmail,
          code,
        }),
      });

      const payload = (await response.json()) as VerifyResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Xác minh đăng ký thất bại.");
        return;
      }

      setMessage(`${payload.message ?? "Đăng ký thành công."}${payload.username ? ` Username: ${payload.username}.` : ""}`);
      setPassword("");
      setConfirmPassword("");
      setVerificationCode("");

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch {
      setError("Không kết nối được dịch vụ xác minh.");
    } finally {
      setVerifying(false);
    }
  }

  async function onResendCode() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const requested = await requestVerificationCode();
      if (!requested.ok) {
        setError(requested.error);
        return;
      }

      setVerificationEmail(requested.payload.email ?? verificationEmail);
      setExpiresAt(requested.payload.expiresAt ?? null);
      setMessage(
        `Đã gửi lại mã xác minh.${requested.payload.devCode ? ` [DEV CODE: ${requested.payload.devCode}]` : ""}`,
      );
    } catch {
      setError("Không thể gửi lại mã xác minh.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "VERIFY") {
    const expiryLabel = formatExpiry(expiresAt);

    return (
      <form className="login-form" onSubmit={onSubmitVerify}>
        <label>
          Email xác minh
          <input value={verificationEmail} onChange={(event) => setVerificationEmail(event.target.value)} required />
        </label>

        <label>
          Mã xác minh 6 số
          <input
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            placeholder="123456"
            inputMode="numeric"
            required
          />
        </label>

        {expiryLabel ? <p className="hint-text">Mã hiện tại hết hạn lúc: {expiryLabel}</p> : null}

        <button type="submit" className="button-primary" disabled={verifying}>
          {verifying ? "Đang xác minh..." : "Xác minh và tạo tài khoản"}
        </button>

        <button type="button" className="button-secondary" onClick={() => void onResendCode()} disabled={loading || verifying}>
          {loading ? "Đang gửi..." : "Gửi lại mã"}
        </button>

        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setStep("FORM");
            setError(null);
            setMessage(null);
          }}
          disabled={loading || verifying}
        >
          Quay lại chỉnh thông tin
        </button>

        {message ? <p className="status-ok">{message}</p> : null}
        {error ? <p className="status-error">{error}</p> : null}

        <p className="hint-text">
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </p>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={onSubmitRegistration}>
      <label>
        Họ tên
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nguyễn Văn A" required />
      </label>

      <label>
        Email sinh viên
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="abc123@sis.hust.edu.vn"
          required
        />
      </label>

      <label>
        Mật khẩu
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Tối thiểu 8 ký tự"
          required
          minLength={8}
        />
      </label>

      <label>
        Nhập lại mật khẩu
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Xác nhận mật khẩu"
          required
          minLength={8}
        />
      </label>

      <label>
        Khóa (optional)
        <input value={cohortCode} onChange={(event) => setCohortCode(event.target.value)} placeholder="K69" />
      </label>

      <label>
        Lớp (optional)
        <input value={classGroupName} onChange={(event) => setClassGroupName(event.target.value)} placeholder="IT 01" />
      </label>

      <label>
        MSSV (optional)
        <input value={studentCode} onChange={(event) => setStudentCode(event.target.value)} placeholder="2026xxxx" />
      </label>

      <button type="submit" className="button-primary" disabled={loading}>
        {loading ? "Đang gửi mã..." : "Đăng ký và nhận mã xác minh"}
      </button>

      {message ? <p className="status-ok">{message}</p> : null}
      {error ? <p className="status-error">{error}</p> : null}

      <p className="hint-text">
        Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
      </p>
    </form>
  );
}
