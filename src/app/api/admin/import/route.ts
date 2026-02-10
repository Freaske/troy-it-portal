import { NextRequest, NextResponse } from "next/server";

import {
  importWorkbookFromBuffer,
  importWorkbookFromPath,
  resolveDefaultWorkbookPath,
} from "@/lib/importers/springSchedule";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest, tokenFromBody?: string): boolean {
  const expectedToken = process.env.ADMIN_IMPORT_TOKEN;
  if (!expectedToken) {
    return false;
  }

  const headerToken = request.headers.get("x-import-token");
  return headerToken === expectedToken || tokenFromBody === expectedToken;
}

async function hasAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  return session?.role === "ADMIN";
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const hasAdmin = await hasAdminSession(request);

  try {
    if (!contentType.includes("multipart/form-data")) {
      if (!hasAdmin && !isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const summary = await importWorkbookFromPath(prisma, resolveDefaultWorkbookPath());
      return NextResponse.json({ ok: true, summary });
    }

    const formData = await request.formData();
    const token = String(formData.get("token") ?? "");

    if (!hasAdmin && !isAuthorized(request, token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      const summary = await importWorkbookFromPath(prisma, resolveDefaultWorkbookPath());
      return NextResponse.json({ ok: true, summary });
    }

    const arrayBuffer = await file.arrayBuffer();
    const summary = await importWorkbookFromBuffer(prisma, Buffer.from(arrayBuffer), file.name);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown import error",
      },
      { status: 500 },
    );
  }
}
