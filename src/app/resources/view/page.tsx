import fs from "node:fs";
import path from "node:path";

import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import type { ReactNode } from "react";
import sanitizeHtml from "sanitize-html";

import { resolveResourceFilePath } from "@/lib/knowledge";

import { BinaryViewer } from "./binary-viewer";

type ResourceViewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function decodeUtf8Text(buffer: Buffer): string {
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  return text;
}

function renderMarkdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, {
    gfm: true,
    breaks: true,
  }) as string;

  return sanitizeHtml(rawHtml, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
      "code",
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      code: ["class"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noreferrer",
        target: "_blank",
      }),
    },
  });
}

export default async function ResourceViewPage({ searchParams }: ResourceViewPageProps) {
  const query = await searchParams;

  const course = single(query.course);
  const relativePath = single(query.path);

  const resolved = resolveResourceFilePath(course, relativePath);
  if (!resolved) {
    notFound();
  }

  const extension = path.extname(resolved.absolutePath).replace(/^\./, "").toLowerCase();
  const rawFileUrl = `/api/resources/file?course=${encodeURIComponent(resolved.courseCode)}&path=${encodeURIComponent(
    resolved.relativePath,
  )}`;

  let content: ReactNode = null;

  if (extension === "pdf") {
    content = (
      <section className="details-card viewer-card">
        <iframe src={rawFileUrl} title={resolved.relativePath} className="file-iframe" />
      </section>
    );
  } else if (extension === "md" || extension === "markdown") {
    const markdown = decodeUtf8Text(fs.readFileSync(resolved.absolutePath));
    const html = renderMarkdownToHtml(markdown);

    content = (
      <section className="details-card viewer-card markdown-viewer" dangerouslySetInnerHTML={{ __html: html }} />
    );
  } else if (extension === "txt") {
    const text = decodeUtf8Text(fs.readFileSync(resolved.absolutePath));
    content = (
      <section className="details-card viewer-card text-viewer">
        <pre>{text}</pre>
      </section>
    );
  } else if (extension === "docx" || extension === "pptx") {
    content = <BinaryViewer fileUrl={rawFileUrl} extension={extension} />;
  } else {
    content = (
      <section className="details-card viewer-card">
        <p>
          Format <code>{extension || "unknown"}</code> is not yet supported for full preview. You can still open it
          directly in browser.
        </p>
      </section>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">Academic Resource Viewer</p>
        <h1>{resolved.relativePath}</h1>
        <p>
          Course: <strong>{resolved.courseCode}</strong> · Format: <strong>{extension.toUpperCase() || "Unknown"}</strong>
        </p>
        <div className="chip-row">
          <Link href={`/courses/${encodeURIComponent(resolved.courseCode)}`} className="chip link-chip">
            Back to course
          </Link>
          <Link href={`/resources?course=${encodeURIComponent(resolved.courseCode)}`} className="chip link-chip">
            Back to resource hub
          </Link>
          <a href={rawFileUrl} target="_blank" rel="noreferrer" className="chip link-chip">
            Open raw file
          </a>
        </div>
      </section>

      {content}
    </main>
  );
}
