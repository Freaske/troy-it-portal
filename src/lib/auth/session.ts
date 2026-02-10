import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n";

export const AUTH_COOKIE_NAME = "tkb_portal_session";

export type UserRole = "ADMIN" | "STUDENT" | "LECTURER";

export type PortalSession = {
  userId?: string | null;
  username: string;
  email?: string | null;
  name: string;
  role: UserRole;
  language?: UiLanguage;
  cohortCode?: string | null;
  classGroupName?: string | null;
  studentCode?: string | null;
};

type PortalUser = {
  username: string;
  password: string;
  name: string;
  role: UserRole;
};

const DEFAULT_USERS: PortalUser[] = [
  {
    username: "admin",
    password: "hust2026",
    name: "Portal Admin",
    role: "ADMIN",
  },
  {
    username: "student",
    password: "troy2026",
    name: "Sinh viên Troy IT",
    role: "STUDENT",
  },
  {
    username: "lecturer",
    password: "bkhanoi2026",
    name: "Giảng viên",
    role: "LECTURER",
  },
];

function getSecret() {
  const raw = process.env.AUTH_SECRET ?? "CHANGE_THIS_AUTH_SECRET_IN_PRODUCTION";
  return new TextEncoder().encode(raw);
}

function parseRole(raw: string): UserRole {
  const role = raw.trim().toUpperCase();
  if (role === "ADMIN" || role === "LECTURER") {
    return role;
  }
  return "STUDENT";
}

function parseUserLine(line: string): PortalUser | null {
  const parts = line.split(":").map((part) => part.trim());
  if (parts.length < 2) {
    return null;
  }

  const [username, password, roleRaw, ...nameParts] = parts;
  if (!username || !password) {
    return null;
  }

  return {
    username,
    password,
    role: parseRole(roleRaw ?? "STUDENT"),
    name: nameParts.join(":") || username,
  };
}

export function getPortalUsers(): PortalUser[] {
  const envConfig = process.env.PORTAL_USERS;
  if (!envConfig) {
    return DEFAULT_USERS;
  }

  const parsed = envConfig
    .split(";")
    .map((line) => parseUserLine(line))
    .filter((user): user is PortalUser => Boolean(user));

  if (parsed.length === 0) {
    return DEFAULT_USERS;
  }

  return parsed;
}

export function getDemoUsers() {
  return getPortalUsers().map((user) => ({
    username: user.username,
    password: user.password,
    role: user.role,
    name: user.name,
  }));
}

export async function validateDemoCredentials(username: string, password: string): Promise<PortalSession | null> {
  const user = getPortalUsers().find(
    (item) => item.username.toLowerCase() === username.toLowerCase() && item.password === password,
  );

  if (!user) {
    return null;
  }

  return {
    userId: null,
    username: user.username,
    email: null,
    name: user.name,
    role: user.role,
    language: "VI",
    cohortCode: null,
    classGroupName: null,
    studentCode: null,
  };
}

export async function validateCredentials(username: string, password: string): Promise<PortalSession | null> {
  return validateDemoCredentials(username, password);
}

export async function createSessionToken(session: PortalSession): Promise<string> {
  return new SignJWT({
    userId: session.userId ?? null,
    username: session.username,
    email: session.email ?? null,
    name: session.name,
    role: session.role,
    language: session.language ?? "VI",
    cohortCode: session.cohortCode ?? null,
    classGroupName: session.classGroupName ?? null,
    studentCode: session.studentCode ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function verifySessionToken(token: string | undefined | null): Promise<PortalSession | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    const userId = optionalText(payload.userId);
    const username = optionalText(payload.username);
    const email = optionalText(payload.email);
    const name = optionalText(payload.name);
    const role = typeof payload.role === "string" ? parseRole(payload.role) : null;
    const language = normalizeUiLanguage(optionalText(payload.language), "VI");
    const cohortCode = optionalText(payload.cohortCode);
    const classGroupName = optionalText(payload.classGroupName);
    const studentCode = optionalText(payload.studentCode);

    if (!username || !name || !role) {
      return null;
    }

    return {
      userId,
      username,
      email,
      name,
      role,
      language,
      cohortCode,
      classGroupName,
      studentCode,
    };
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}
