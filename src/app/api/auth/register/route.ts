import { NextRequest, NextResponse } from "next/server";

import { requestStudentRegistrationCode } from "@/lib/auth/accounts";

type RegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  cohortCode?: unknown;
  classGroupName?: unknown;
  studentCode?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as RegisterBody;
    const result = await requestStudentRegistrationCode({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      cohortCode: payload.cohortCode,
      classGroupName: payload.classGroupName,
      studentCode: payload.studentCode,
    });

    if (!result.requested) {
      return NextResponse.json({ ok: false, error: result.error ?? "Cannot send verification code." }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        email: result.email,
        expiresAt: result.expiresAt,
        devCode: result.devCode,
        message: "Verification code sent. Please verify your email to complete registration.",
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Registration failed." }, { status: 500 });
  }
}
