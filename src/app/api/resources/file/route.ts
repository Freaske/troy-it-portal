import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { resolveResourceFilePath } from "@/lib/knowledge";

function detectContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();

  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".zip": "application/zip",
  };

  return map[ext] ?? "application/octet-stream";
}

export function GET(request: NextRequest) {
  const course = request.nextUrl.searchParams.get("course") ?? "";
  const relative = request.nextUrl.searchParams.get("path") ?? "";

  const resolved = resolveResourceFilePath(course, relative);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid course/path" }, { status: 400 });
  }

  const fileBuffer = fs.readFileSync(resolved.absolutePath);
  const fileName = path.basename(resolved.absolutePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": detectContentType(fileName),
      "Content-Disposition": `inline; filename=\"${encodeURIComponent(fileName)}\"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
