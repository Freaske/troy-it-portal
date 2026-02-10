import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

const UPLOAD_DIR = "/data/uploads/lecturers";
const FALLBACK_DIR = path.resolve(process.cwd(), "public/uploads/lecturers");
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function contentTypeFromExtension(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

async function readFromCandidates(fileName: string): Promise<Buffer | null> {
  const candidates = [path.join(UPLOAD_DIR, fileName), path.join(FALLBACK_DIR, fileName)];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ file: string }> },
) {
  const params = await context.params;
  const rawFile = params.file ?? "";
  const fileName = path.basename(rawFile).trim();

  if (!fileName || fileName !== rawFile) {
    return NextResponse.json({ ok: false, error: "Invalid file name." }, { status: 400 });
  }

  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ ok: false, error: "Unsupported file extension." }, { status: 400 });
  }

  const buffer = await readFromCandidates(fileName);
  if (!buffer) {
    return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFromExtension(ext),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
