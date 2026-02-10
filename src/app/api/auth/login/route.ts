import { NextRequest, NextResponse } from "next/server";

import {
  createSessionToken,
  validateDemoCredentials,
} from "@/lib/auth/session";
import { authenticateAccountLogin } from "@/lib/auth/accounts";
import { setSessionCookie } from "@/lib/auth/cookies";

type LoginBody = {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  deviceId?: unknown;
  deviceLabel?: unknown;
};

function cleanText(value: unknown, maxLength = 180): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function identityFromPayload(payload: LoginBody): string {
  return cleanText(payload.username, 220) || cleanText(payload.email, 220);
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as LoginBody;

    const identity = identityFromPayload(payload);
    const password = typeof payload.password === "string" ? payload.password : "";
    const deviceId = payload.deviceId;
    const deviceLabel = payload.deviceLabel;

    if (!identity || !password) {
      return NextResponse.json({ ok: false, error: "Missing username/email or password" }, { status: 400 });
    }

    const demoSession = await validateDemoCredentials(identity, password);
    if (demoSession) {
      const token = await createSessionToken(demoSession);
      const response = NextResponse.json({ ok: true, user: demoSession, mode: "demo" });
      setSessionCookie(response, token);
      return response;
    }

    const accountLogin = await authenticateAccountLogin({
      identity,
      password,
      deviceId,
      deviceLabel,
    });

    if (accountLogin.status === "invalid") {
      return NextResponse.json({ ok: false, error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
    }

    if (accountLogin.status === "challenge") {
      return NextResponse.json(
        {
          ok: true,
          requiresDeviceVerification: true,
          challengeId: accountLogin.challengeId,
          expiresAt: accountLogin.expiresAt,
          maskedEmail: accountLogin.maskedEmail,
          ...(accountLogin.devCode ? { devCode: accountLogin.devCode } : {}),
        },
        { status: 202 },
      );
    }

    const token = await createSessionToken(accountLogin.session);
    const response = NextResponse.json({ ok: true, user: accountLogin.session, mode: "account" });
    setSessionCookie(response, token);
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}
