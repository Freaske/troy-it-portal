import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import type { AccountUser } from "@prisma/client";

import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

import { sendRegistrationVerificationCode } from "./email";
import { hashPassword, verifyPassword } from "./password";
import type { PortalSession } from "./session";

const SIS_DOMAIN = "@sis.hust.edu.vn";
const DEVICE_CODE_TTL_MS = 5 * 60 * 1000;
const REGISTRATION_CODE_TTL_MS = 10 * 60 * 1000;

type OptionalPatch = string | null | undefined;

export type UserProfile = {
  username: string;
  role: string;
  email: string | null;
  displayName: string;
  cohortCode: string | null;
  classGroupName: string | null;
  studentCode: string | null;
  preferredLanguage: UiLanguage;
};

export type DeviceChallengeResult = {
  challengeId: string;
  expiresAt: string;
  maskedEmail: string;
  devCode?: string;
};

export type AccountLoginResult =
  | { status: "invalid" }
  | { status: "ok"; session: PortalSession }
  | ({ status: "challenge" } & DeviceChallengeResult);

export type RegistrationCodeRequestResult = {
  requested: boolean;
  error?: string;
  email?: string;
  expiresAt?: string;
  devCode?: string;
};

type ProfilePatch = {
  displayName?: OptionalPatch;
  email?: OptionalPatch;
  cohortCode?: OptionalPatch;
  classGroupName?: OptionalPatch;
  studentCode?: OptionalPatch;
  preferredLanguage?: UiLanguage | null | undefined;
};

type AccountDelegate = {
  findUnique?: (args: unknown) => Promise<AccountUser | null>;
};

type UserSettingDelegate = {
  findUnique?: (args: unknown) => Promise<{
    email: string | null;
    displayName: string | null;
    cohortCode: string | null;
    classGroupName: string | null;
    studentCode: string | null;
    preferredLanguage: UiLanguage;
  } | null>;
};

function getAccountDelegate(): AccountDelegate | null {
  const delegate = (prisma as unknown as { accountUser?: AccountDelegate }).accountUser;
  if (!delegate || typeof delegate.findUnique !== "function") {
    return null;
  }

  return delegate;
}

function getUserSettingDelegate(): UserSettingDelegate | null {
  const delegate = (prisma as unknown as { userSetting?: UserSettingDelegate }).userSetting;
  if (!delegate || typeof delegate.findUnique !== "function") {
    return null;
  }

  return delegate;
}

function hasAccountStorage(): boolean {
  const db = prisma as unknown as {
    accountUser?: unknown;
    userSetting?: unknown;
  };

  return Boolean(db.accountUser && db.userSetting);
}

function hasDeviceStorage(): boolean {
  const db = prisma as unknown as {
    deviceTrust?: unknown;
    deviceChallenge?: unknown;
  };

  return Boolean(db.deviceTrust && db.deviceChallenge);
}

function hasRegistrationStorage(): boolean {
  const db = prisma as unknown as {
    registrationVerification?: unknown;
  };

  return Boolean(db.registrationVerification);
}

function cleanText(value: unknown, maxLength = 180): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeIdentity(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeEmail(raw: string): string {
  return normalizeIdentity(raw);
}

function normalizeUsername(raw: string): string {
  const cleaned = normalizeIdentity(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.slice(0, 60);
}

function profileValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function applyPatchValue(raw: OptionalPatch, maxLength = 180): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === null) {
    return null;
  }

  const trimmed = cleanText(raw, maxLength);
  return trimmed ? trimmed : null;
}

function toPortalSession(user: AccountUser, preferredLanguage: UiLanguage = "VI"): PortalSession {
  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: (user.role as PortalSession["role"]) ?? "STUDENT",
    language: preferredLanguage,
    cohortCode: user.cohortCode,
    classGroupName: user.classGroupName,
    studentCode: user.studentCode,
  };
}

function getVerificationSecret(): string {
  return process.env.AUTH_SECRET ?? "CHANGE_THIS_AUTH_SECRET_IN_PRODUCTION";
}

function hashVerificationCode(code: string): string {
  return createHash("sha256").update(`${getVerificationSecret()}:${code}`).digest("hex");
}

function cleanDeviceId(raw: unknown): string | null {
  const value = cleanText(raw, 200)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");

  if (!value) {
    return null;
  }

  return value;
}

function cleanDeviceLabel(raw: unknown): string | null {
  const value = cleanText(raw, 180);
  return value || null;
}

function isSameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? "*"}*@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function isSisEmail(raw: string): boolean {
  const normalized = normalizeEmail(raw);
  return normalized.endsWith(SIS_DOMAIN) && normalized.includes("@");
}

async function findAccountByIdentity(identity: string): Promise<AccountUser | null> {
  const normalized = normalizeIdentity(identity);
  if (!normalized) {
    return null;
  }

  return prisma.accountUser.findFirst({
    where: {
      OR: [{ username: normalized }, { email: normalized }],
    },
  });
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const normalizedBase = normalizeUsername(base) || `student-${Date.now().toString(36)}`;
  let candidate = normalizedBase;

  for (let index = 0; index < 200; index += 1) {
    const existed = await prisma.accountUser.findUnique({
      where: { username: candidate },
      select: { id: true },
    });

    if (!existed) {
      return candidate;
    }

    candidate = `${normalizedBase}${index + 1}`;
  }

  return `${normalizedBase}${Date.now().toString(36)}`;
}

export async function authenticateAccountLogin(input: {
  identity: string;
  password: string;
  deviceId: unknown;
  deviceLabel?: unknown;
}): Promise<AccountLoginResult> {
  if (!hasAccountStorage() || !hasDeviceStorage()) {
    return { status: "invalid" };
  }

  const identity = cleanText(input.identity, 180);
  const password = typeof input.password === "string" ? input.password : "";
  const deviceId = cleanDeviceId(input.deviceId);
  const deviceLabel = cleanDeviceLabel(input.deviceLabel);

  if (!identity || !password || !deviceId) {
    return { status: "invalid" };
  }

  const user = await findAccountByIdentity(identity);
  if (!user) {
    return { status: "invalid" };
  }

  const userSetting = await prisma.userSetting.findUnique({
    where: { username: user.username },
    select: {
      preferredLanguage: true,
    },
  });
  const preferredLanguage = normalizeUiLanguage(userSetting?.preferredLanguage, "VI");

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { status: "invalid" };
  }

  const trusted = await prisma.deviceTrust.findUnique({
    where: {
      userId_deviceId: {
        userId: user.id,
        deviceId,
      },
    },
    select: { id: true },
  });

  if (trusted) {
    await prisma.deviceTrust.update({
      where: {
        userId_deviceId: {
          userId: user.id,
          deviceId,
        },
      },
      data: {
        lastUsed: new Date(),
        ...(deviceLabel ? { label: deviceLabel } : {}),
      },
    });

    return {
      status: "ok",
      session: toPortalSession(user, preferredLanguage),
    };
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

  await prisma.deviceChallenge.updateMany({
    where: {
      userId: user.id,
      deviceId,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  const challenge = await prisma.deviceChallenge.create({
    data: {
      userId: user.id,
      deviceId,
      codeHash: hashVerificationCode(code),
      expiresAt,
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  console.info(`[auth] Device verification code for ${user.email}: ${code}`);

  return {
    status: "challenge",
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    maskedEmail: maskEmail(user.email),
    ...(process.env.NODE_ENV === "production" ? {} : { devCode: code }),
  };
}

export async function verifyDeviceChallenge(input: {
  challengeId: unknown;
  code: unknown;
  deviceId: unknown;
  deviceLabel?: unknown;
}): Promise<PortalSession | null> {
  if (!hasDeviceStorage()) {
    return null;
  }

  const challengeId = cleanText(input.challengeId, 120);
  const code = cleanText(input.code, 20).replace(/\s+/g, "");
  const deviceId = cleanDeviceId(input.deviceId);
  const deviceLabel = cleanDeviceLabel(input.deviceLabel);

  if (!challengeId || !code || !deviceId) {
    return null;
  }

  const challenge = await prisma.deviceChallenge.findUnique({
    where: { id: challengeId },
    include: {
      user: true,
    },
  });

  if (!challenge || challenge.consumedAt || challenge.deviceId !== deviceId) {
    return null;
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const codeHash = hashVerificationCode(code);
  if (!isSameHash(codeHash, challenge.codeHash)) {
    return null;
  }

  const userSetting = await prisma.userSetting.findUnique({
    where: { username: challenge.user.username },
    select: {
      preferredLanguage: true,
    },
  });
  const preferredLanguage = normalizeUiLanguage(userSetting?.preferredLanguage, "VI");

  await prisma.$transaction([
    prisma.deviceChallenge.update({
      where: { id: challenge.id },
      data: {
        consumedAt: new Date(),
      },
    }),
    prisma.deviceTrust.upsert({
      where: {
        userId_deviceId: {
          userId: challenge.userId,
          deviceId,
        },
      },
      create: {
        userId: challenge.userId,
        deviceId,
        label: deviceLabel,
      },
      update: {
        lastUsed: new Date(),
        ...(deviceLabel ? { label: deviceLabel } : {}),
      },
    }),
  ]);

  return toPortalSession(challenge.user, preferredLanguage);
}

type NormalizedRegistrationInput = {
  email: string;
  password: string;
  name: string;
  cohortCode: string | null;
  classGroupName: string | null;
  studentCode: string | null;
};

function normalizeRegistrationInput(input: {
  name: unknown;
  email: unknown;
  password: unknown;
  cohortCode?: unknown;
  classGroupName?: unknown;
  studentCode?: unknown;
}): { ok: true; value: NormalizedRegistrationInput } | { ok: false; error: string } {
  const email = normalizeEmail(cleanText(input.email, 220));
  const password = typeof input.password === "string" ? input.password : "";
  const requestedName = cleanText(input.name, 140);
  const cohortCode = applyPatchValue(cleanText(input.cohortCode, 40)) ?? null;
  const classGroupName = applyPatchValue(cleanText(input.classGroupName, 80)) ?? null;
  const studentCode = applyPatchValue(cleanText(input.studentCode, 80)) ?? null;

  if (!email || !isSisEmail(email)) {
    return { ok: false, error: "Only @sis.hust.edu.vn email is allowed." };
  }

  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const localPart = email.split("@")[0] ?? "student";
  const name = requestedName || localPart;

  return {
    ok: true,
    value: {
      email,
      password,
      name,
      cohortCode,
      classGroupName,
      studentCode,
    },
  };
}

async function createStudentAccountFromHashedPassword(input: {
  email: string;
  name: string;
  passwordHash: string;
  cohortCode: string | null;
  classGroupName: string | null;
  studentCode: string | null;
}): Promise<{ created: boolean; error?: string; username?: string }> {
  const existingEmail = await prisma.accountUser.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingEmail) {
    return { created: false, error: "Email already registered." };
  }

  const localPart = input.email.split("@")[0] ?? "student";
  const username = await ensureUniqueUsername(localPart);

  await prisma.$transaction([
    prisma.accountUser.create({
      data: {
        username,
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        role: "STUDENT",
        cohortCode: input.cohortCode,
        classGroupName: input.classGroupName,
        studentCode: input.studentCode,
      },
    }),
    prisma.userSetting.upsert({
      where: { username },
      create: {
        username,
        email: input.email,
        displayName: input.name,
        cohortCode: input.cohortCode,
        classGroupName: input.classGroupName,
        studentCode: input.studentCode,
        preferredLanguage: "VI",
      },
      update: {
        email: input.email,
        displayName: input.name,
        cohortCode: input.cohortCode,
        classGroupName: input.classGroupName,
        studentCode: input.studentCode,
        preferredLanguage: "VI",
      },
    }),
  ]);

  return { created: true, username };
}

export async function requestStudentRegistrationCode(input: {
  name: unknown;
  email: unknown;
  password: unknown;
  cohortCode?: unknown;
  classGroupName?: unknown;
  studentCode?: unknown;
}): Promise<RegistrationCodeRequestResult> {
  if (!hasAccountStorage() || !hasRegistrationStorage()) {
    return {
      requested: false,
      error: "Auth database not ready. Run `npx prisma generate && npx prisma db push`, then restart `npm run dev`.",
    };
  }

  const normalized = normalizeRegistrationInput(input);
  if (!normalized.ok) {
    return {
      requested: false,
      error: normalized.error,
    };
  }

  const existingEmail = await prisma.accountUser.findUnique({
    where: { email: normalized.value.email },
    select: { id: true },
  });
  if (existingEmail) {
    return {
      requested: false,
      error: "Email already registered.",
    };
  }

  const code = String(randomInt(100000, 1000000));
  const codeHash = hashVerificationCode(code);
  const passwordHash = await hashPassword(normalized.value.password);
  const expiresAt = new Date(Date.now() + REGISTRATION_CODE_TTL_MS);

  await prisma.registrationVerification.upsert({
    where: {
      email: normalized.value.email,
    },
    create: {
      email: normalized.value.email,
      name: normalized.value.name,
      passwordHash,
      cohortCode: normalized.value.cohortCode,
      classGroupName: normalized.value.classGroupName,
      studentCode: normalized.value.studentCode,
      codeHash,
      expiresAt,
      resendCount: 0,
    },
    update: {
      name: normalized.value.name,
      passwordHash,
      cohortCode: normalized.value.cohortCode,
      classGroupName: normalized.value.classGroupName,
      studentCode: normalized.value.studentCode,
      codeHash,
      expiresAt,
      consumedAt: null,
      resendCount: {
        increment: 1,
      },
    },
  });

  const sendResult = await sendRegistrationVerificationCode({
    toEmail: normalized.value.email,
    fullName: normalized.value.name,
    code,
    expiresMinutes: Math.floor(REGISTRATION_CODE_TTL_MS / 60000),
  });

  if (!sendResult.sent) {
    return {
      requested: false,
      error: sendResult.error ?? "Cannot send verification code email.",
    };
  }

  return {
    requested: true,
    email: normalized.value.email,
    expiresAt: expiresAt.toISOString(),
    devCode: sendResult.devCode,
  };
}

export async function verifyStudentRegistrationCode(input: {
  email: unknown;
  code: unknown;
}): Promise<{ created: boolean; error?: string; username?: string }> {
  if (!hasAccountStorage() || !hasRegistrationStorage()) {
    return {
      created: false,
      error: "Auth database not ready. Run `npx prisma generate && npx prisma db push`, then restart `npm run dev`.",
    };
  }

  const email = normalizeEmail(cleanText(input.email, 220));
  const code = cleanText(input.code, 20).replace(/\s+/g, "");
  if (!email || !code || !isSisEmail(email)) {
    return {
      created: false,
      error: "Invalid email or verification code.",
    };
  }

  const verification = await prisma.registrationVerification.findUnique({
    where: { email },
  });

  if (!verification || verification.consumedAt) {
    return {
      created: false,
      error: "Verification session not found. Please request a new code.",
    };
  }

  if (verification.expiresAt.getTime() < Date.now()) {
    return {
      created: false,
      error: "Verification code has expired. Please request a new code.",
    };
  }

  const inputHash = hashVerificationCode(code);
  if (!isSameHash(inputHash, verification.codeHash)) {
    return {
      created: false,
      error: "Invalid verification code.",
    };
  }

  const created = await createStudentAccountFromHashedPassword({
    email: verification.email,
    name: verification.name,
    passwordHash: verification.passwordHash,
    cohortCode: verification.cohortCode,
    classGroupName: verification.classGroupName,
    studentCode: verification.studentCode,
  });

  if (!created.created || !created.username) {
    return created;
  }

  await prisma.registrationVerification.update({
    where: { id: verification.id },
    data: {
      consumedAt: new Date(),
    },
  });

  return created;
}

export async function registerStudentAccount(input: {
  name: unknown;
  email: unknown;
  password: unknown;
  cohortCode?: unknown;
  classGroupName?: unknown;
  studentCode?: unknown;
}): Promise<{ created: boolean; error?: string; username?: string }> {
  if (!hasAccountStorage()) {
    return {
      created: false,
      error: "Auth database not ready. Run `npx prisma generate` and restart `npm run dev`.",
    };
  }

  const normalized = normalizeRegistrationInput(input);
  if (!normalized.ok) {
    return {
      created: false,
      error: normalized.error,
    };
  }

  const passwordHash = await hashPassword(normalized.value.password);
  return createStudentAccountFromHashedPassword({
    email: normalized.value.email,
    name: normalized.value.name,
    passwordHash,
    cohortCode: normalized.value.cohortCode,
    classGroupName: normalized.value.classGroupName,
    studentCode: normalized.value.studentCode,
  });
}

export async function getUserProfile(usernameRaw: string, roleFallback?: string): Promise<UserProfile | null> {
  const username = normalizeIdentity(usernameRaw);
  if (!username) {
    return null;
  }

  const accountDelegate = getAccountDelegate();
  const userSettingDelegate = getUserSettingDelegate();

  if (!accountDelegate || !userSettingDelegate) {
    return null;
  }

  const [account, setting] = await Promise.all([
    accountDelegate.findUnique!({
      where: { username },
    }),
    userSettingDelegate.findUnique!({
      where: { username },
    }),
  ]);

  if (!account && !setting) {
    return null;
  }

  return {
    username,
    role: account?.role ?? roleFallback ?? "STUDENT",
    email: setting?.email ?? account?.email ?? null,
    displayName: setting?.displayName ?? account?.name ?? username,
    cohortCode: profileValue(setting?.cohortCode ?? account?.cohortCode ?? null),
    classGroupName: profileValue(setting?.classGroupName ?? account?.classGroupName ?? null),
    studentCode: profileValue(setting?.studentCode ?? account?.studentCode ?? null),
    preferredLanguage: normalizeUiLanguage(setting?.preferredLanguage, "VI"),
  };
}

export async function updateUserProfile(
  usernameRaw: string,
  patch: ProfilePatch,
  roleFallback?: string,
): Promise<UserProfile | null> {
  if (!hasAccountStorage()) {
    return null;
  }

  const username = normalizeIdentity(usernameRaw);
  if (!username) {
    return null;
  }

  const account = await prisma.accountUser.findUnique({
    where: { username },
  });

  const displayName = applyPatchValue(patch.displayName, 140);
  const emailRaw = applyPatchValue(patch.email, 220);
  const cohortCode = applyPatchValue(patch.cohortCode, 40);
  const classGroupName = applyPatchValue(patch.classGroupName, 80);
  const studentCode = applyPatchValue(patch.studentCode, 80);
  const preferredLanguage = patch.preferredLanguage ? normalizeUiLanguage(patch.preferredLanguage, "VI") : undefined;

  const role = account?.role ?? roleFallback ?? "STUDENT";

  if (emailRaw !== undefined && emailRaw !== null && role === "STUDENT" && !isSisEmail(emailRaw)) {
    return null;
  }

  const normalizedEmail =
    emailRaw === undefined ? undefined : emailRaw === null ? null : normalizeEmail(emailRaw);

  if (normalizedEmail) {
    const occupied = await prisma.accountUser.findFirst({
      where: {
        email: normalizedEmail,
        username: { not: username },
      },
      select: { id: true },
    });

    if (occupied) {
      return null;
    }
  }

  await prisma.$transaction(async (tx) => {
    if (account) {
      const accountPatch: {
        name?: string;
        email?: string;
        cohortCode?: string | null;
        classGroupName?: string | null;
        studentCode?: string | null;
      } = {};

      if (displayName !== undefined && displayName !== null) {
        accountPatch.name = displayName;
      }
      if (normalizedEmail !== undefined && normalizedEmail !== null) {
        accountPatch.email = normalizedEmail;
      }

      if (role === "STUDENT") {
        if (cohortCode !== undefined) {
          accountPatch.cohortCode = cohortCode;
        }
        if (classGroupName !== undefined) {
          accountPatch.classGroupName = classGroupName;
        }
        if (studentCode !== undefined) {
          accountPatch.studentCode = studentCode;
        }
      }

      if (Object.keys(accountPatch).length > 0) {
        await tx.accountUser.update({
          where: { username },
          data: accountPatch,
        });
      }
    }

    const settingPatch: {
      displayName?: string | null;
      email?: string | null;
      cohortCode?: string | null;
      classGroupName?: string | null;
      studentCode?: string | null;
      preferredLanguage?: UiLanguage;
    } = {};

    if (displayName !== undefined) {
      settingPatch.displayName = displayName;
    }
    if (normalizedEmail !== undefined) {
      settingPatch.email = normalizedEmail;
    }
    if (cohortCode !== undefined) {
      settingPatch.cohortCode = cohortCode;
    }
    if (classGroupName !== undefined) {
      settingPatch.classGroupName = classGroupName;
    }
    if (studentCode !== undefined) {
      settingPatch.studentCode = studentCode;
    }
    if (preferredLanguage !== undefined) {
      settingPatch.preferredLanguage = preferredLanguage;
    }

    await tx.userSetting.upsert({
      where: { username },
      create: {
        username,
        displayName: settingPatch.displayName ?? account?.name ?? username,
        email: settingPatch.email ?? account?.email ?? null,
        cohortCode: settingPatch.cohortCode ?? account?.cohortCode ?? null,
        classGroupName: settingPatch.classGroupName ?? account?.classGroupName ?? null,
        studentCode: settingPatch.studentCode ?? account?.studentCode ?? null,
        preferredLanguage: settingPatch.preferredLanguage ?? "VI",
      },
      update: settingPatch,
    });
  });

  return getUserProfile(username, role);
}
