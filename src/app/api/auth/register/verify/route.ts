import { NextRequest, NextResponse } from "next/server";

import { verifyStudentRegistrationCode } from "@/lib/auth/accounts";

type VerifyBody = {
  email?: unknown;
  code?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as VerifyBody;
    const result = await verifyStudentRegistrationCode({
      email: payload.email,
      code: payload.code,
    });

    if (!result.created) {
      return NextResponse.json({ ok: false, error: result.error ?? "Cannot verify registration." }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        username: result.username,
        message: "Email verified. Account created successfully.",
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Verification failed." }, { status: 500 });
  }
}
