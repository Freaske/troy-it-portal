"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type LoginResponse = {
  ok?: boolean;
  error?: string;
  requiresDeviceVerification?: boolean;
  challengeId?: string;
  expiresAt?: string;
  maskedEmail?: string;
  devCode?: string;
};

function generateClientDeviceId(): string {
  const fromCrypto = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
  if (fromCrypto) {
    return `mbp-${fromCrypto}`;
  }

  return `mbp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");

  useEffect(() => {
    const storageKey = "tkb_portal_device_id";
    const fromStorage = window.localStorage.getItem(storageKey);
    const resolvedId = fromStorage || generateClientDeviceId();
    if (!fromStorage) {
      window.localStorage.setItem(storageKey, resolvedId);
    }

    setDeviceId(resolvedId);
    setDeviceLabel(`${navigator.platform || "Unknown platform"} · ${navigator.userAgent.slice(0, 90)}`);
  }, []);

  function ensureDeviceId(): string {
    if (deviceId) {
      return deviceId;
    }

    const created = generateClientDeviceId();
    window.localStorage.setItem("tkb_portal_device_id", created);
    setDeviceId(created);
    return created;
  }

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const resolvedDeviceId = ensureDeviceId();

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: identity,
          password,
          deviceId: resolvedDeviceId,
          deviceLabel,
        }),
      });

      const payload = (await response.json()) as LoginResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Login failed");
        return;
      }

      if (payload.requiresDeviceVerification) {
        setChallengeId(payload.challengeId ?? "");
        setMaskedEmail(payload.maskedEmail ?? "");
        setDevCode(payload.devCode ?? null);
        setVerificationCode("");
        setDeviceId(resolvedDeviceId);
        setStep("verify");
        return;
      }

      const nextPath = searchParams.get("next") || "/";
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Cannot connect to auth service.");
    } finally {
      setLoading(false);
    }
  }

  async function submitVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const resolvedDeviceId = ensureDeviceId();

      const response = await fetch("/api/auth/verify-device", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId,
          code: verificationCode,
          deviceId: resolvedDeviceId,
          deviceLabel,
        }),
      });

      const payload = (await response.json()) as LoginResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Invalid verification code.");
        return;
      }

      const nextPath = searchParams.get("next") || "/";
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Cannot verify this device now.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "verify") {
    return (
      <form onSubmit={submitVerification} className="login-form">
        <p className="muted-small">
          Thiết bị mới cần xác thực. Mã đã được gửi tới email: <strong>{maskedEmail || "your account email"}</strong>.
        </p>

        {devCode ? (
          <p className="status-ok">
            Dev mode code: <strong>{devCode}</strong>
          </p>
        ) : null}

        <label>
          Verification code (6 digits)
          <input
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            placeholder="123456"
            inputMode="numeric"
            required
          />
        </label>

        <button type="submit" className="button-primary" disabled={loading}>
          {loading ? "Verifying..." : "Verify & sign in"}
        </button>

        <button type="button" className="button-secondary" onClick={() => setStep("credentials")} disabled={loading}>
          Back to credentials
        </button>

        {error ? <p className="status-error">{error}</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="login-form">
      <label>
        Username or Email
        <input
          value={identity}
          onChange={(event) => setIdentity(event.target.value)}
          placeholder="admin hoặc abc123@sis.hust.edu.vn"
          required
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
        />
      </label>

      <button type="submit" className="button-primary" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <p className="hint-text">
        Chưa có account? <Link href="/register">Đăng ký sinh viên</Link>
      </p>

      {error ? <p className="status-error">{error}</p> : null}
    </form>
  );
}
