import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/request-session";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const UPLOAD_DIR = path.resolve(process.cwd(), "public/uploads/lecturers");

function normalizeLecturerId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionFromFile(file: File): string | null {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  if (file.type && byMime[file.type]) {
    return byMime[file.type];
  }

  const ext = path.extname(file.name).toLowerCase().replace(/^\./, "");
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return null;
}

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequestSession(request);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const params = await context.params;
    const lecturerIdRaw = params.id.trim();
    if (!lecturerIdRaw) {
      return NextResponse.json({ ok: false, error: "Invalid lecturer id." }, { status: 400 });
    }
    const lecturerFileSlug = normalizeLecturerId(lecturerIdRaw) || "lecturer";

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing image file." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "File size must be between 1 byte and 3 MB." },
        { status: 400 },
      );
    }

    const ext = extensionFromFile(file);
    if (!ext) {
      return NextResponse.json(
        { ok: false, error: "Only jpg/png/webp/gif images are supported." },
        { status: 400 },
      );
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const fileName = `${lecturerFileSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const absolutePath = path.join(UPLOAD_DIR, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(absolutePath, buffer);

    const avatarUrl = `/uploads/lecturers/${fileName}`;

    await prisma.lecturerProfile.upsert({
      where: {
        lecturerId: lecturerIdRaw,
      },
      create: {
        lecturerId: lecturerIdRaw,
        avatarUrl,
        updatedBy: session.username,
      },
      update: {
        avatarUrl,
        updatedBy: session.username,
      },
    });

    return NextResponse.json({
      ok: true,
      avatarUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot upload lecturer avatar.";
    if (/avatarUrl|no such column|Unknown argument/i.test(message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Database chưa cập nhật cột avatarUrl. Hãy chạy `npx prisma generate && npx prisma db push` rồi restart dev server.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
