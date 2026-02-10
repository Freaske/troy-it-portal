import { NextRequest, NextResponse } from "next/server";

import { verifyDeviceChallenge } from "@/lib/auth/accounts";
import { setSessionCookie } from "@/lib/auth/cookies";
import { createSessionToken } from "@/lib/auth/session";

type VerifyBody = {
  challengeId?: unknown;
  code?: unknown;
  deviceId?: unknown;
  deviceLabel?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyBody;
    const session = await verifyDeviceChallenge({
      challengeId: body.challengeId,
      code: body.code,
      deviceId: body.deviceId,
      deviceLabel: body.deviceLabel,
    });

    if (!session) {
      return NextResponse.json({ ok: false, error: "Invalid or expired verification code." }, { status: 400 });
    }

    const token = await createSessionToken(session);
    const response = NextResponse.json({ ok: true, user: session });
    setSessionCookie(response, token);
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Cannot verify this device now." }, { status: 500 });
  }
}
