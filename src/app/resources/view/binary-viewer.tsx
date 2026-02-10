"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type BinaryViewerProps = {
  fileUrl: string;
  extension: string;
};

export function BinaryViewer({ fileUrl, extension }: BinaryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizedExt = useMemo(() => extension.toLowerCase(), [extension]);

  useEffect(() => {
    let cancelled = false;

    async function renderBinaryFile() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Could not load file (${response.status}).`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) {
          return;
        }

        if (!containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = "";

        if (normalizedExt === "docx") {
          const docxLib = await import("docx-preview");
          await docxLib.renderAsync(arrayBuffer, containerRef.current, undefined, {
            className: "docx-viewer",
            inWrapper: true,
            breakPages: true,
            ignoreWidth: false,
          });

          if (!cancelled) {
            setLoading(false);
          }

          return;
        }

        if (normalizedExt === "pptx") {
          const pptxModule = await import("pptx-preview");
          const init =
            (pptxModule as { init?: unknown }).init ??
            (pptxModule as { default?: { init?: unknown } }).default?.init;

          if (typeof init !== "function") {
            throw new Error("PPTX viewer library is not available.");
          }

          const presenter = (init as (container: HTMLElement, options?: Record<string, number>) => {
            preview: (buffer: ArrayBuffer) => Promise<void> | void;
          })(containerRef.current, {
            width: 1280,
            height: 720,
          });

          await presenter.preview(arrayBuffer);

          if (!cancelled) {
            setLoading(false);
          }

          return;
        }

        throw new Error("Unsupported binary preview format.");
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to preview file.");
          setLoading(false);
        }
      }
    }

    void renderBinaryFile();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, normalizedExt]);

  return (
    <section className="details-card viewer-card">
      {loading ? <p className="muted-small">Loading preview...</p> : null}
      {error ? <p className="status-error">{error}</p> : null}
      <div ref={containerRef} className="binary-preview-container" />
    </section>
  );
}
