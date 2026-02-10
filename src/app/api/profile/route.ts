import { NextRequest, NextResponse } from "next/server";

import { getUserProfile, updateUserProfile } from "@/lib/auth/accounts";
import { createSessionToken, type PortalSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { getRequestSession } from "@/lib/auth/request-session";
import { normalizeUiLanguage } from "@/lib/i18n";

type ProfilePatchBody = {
  displayName?: unknown;
  email?: unknown;
  cohortCode?: unknown;
  classGroupName?: unknown;
  studentCode?: unknown;
  preferredLanguage?: unknown;
};

function parsePatchValue(value: unknown, maxLength = 180): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim().slice(0, maxLength);
}

function buildFallbackProfile(session: PortalSession) {
  return {
    username: session.username,
    role: session.role,
    email: session.email ?? null,
    displayName: session.name,
    cohortCode: session.cohortCode ?? null,
    classGroupName: session.classGroupName ?? null,
    studentCode: session.studentCode ?? null,
    preferredLanguage: session.language ?? "VI",
  };
}

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getUserProfile(session.username, session.role);
  return NextResponse.json({
    ok: true,
    profile: profile ?? buildFallbackProfile(session),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: ProfilePatchBody;
  try {
    body = (await request.json()) as ProfilePatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const profile = await updateUserProfile(
    session.username,
    {
      displayName: parsePatchValue(body.displayName, 140),
      email: parsePatchValue(body.email, 220),
      cohortCode: parsePatchValue(body.cohortCode, 40),
      classGroupName: parsePatchValue(body.classGroupName, 80),
      studentCode: parsePatchValue(body.studentCode, 80),
      preferredLanguage:
        body.preferredLanguage === undefined ? undefined : normalizeUiLanguage(body.preferredLanguage, "VI"),
    },
    session.role,
  );

  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Cannot update profile. Check email domain/format or duplicate email." },
      { status: 400 },
    );
  }

  const nextSession: PortalSession = {
    ...session,
    name: profile.displayName,
    email: profile.email,
    cohortCode: profile.cohortCode,
    classGroupName: profile.classGroupName,
    studentCode: profile.studentCode,
    language: profile.preferredLanguage,
  };

  const token = await createSessionToken(nextSession);
  const response = NextResponse.json({ ok: true, profile });
  setSessionCookie(response, token);
  return response;
}
