"use client";

import { useState } from "react";

type ImportState = {
  ok: boolean;
  message: string;
} | null;

export function ImportForm() {
  const [importState, setImportState] = useState<ImportState>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function runImport(formData: FormData) {
    setIsLoading(true);
    setImportState(null);

    try {
      const response = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        summary?: {
          semesterLabel: string;
          cohorts: string[];
          entries: number;
          courses: number;
          classGroups: number;
        };
      };

      if (!response.ok || !payload.ok) {
        setImportState({
          ok: false,
          message: payload.error ?? "Import failed.",
        });
        return;
      }

      const summary = payload.summary;
      setImportState({
        ok: true,
        message: summary
          ? `Imported ${summary.entries} schedule rows, ${summary.courses} courses, ${summary.classGroups} class groups (${summary.cohorts.join(", ")}) for ${summary.semesterLabel}.`
          : "Import completed.",
      });
    } catch (error) {
      setImportState({
        ok: false,
        message: error instanceof Error ? error.message : "Unknown import error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await runImport(formData);
  }

  async function handleDefaultImport() {
    await runImport(new FormData());
  }

  return (
    <div className="import-card">
      <form onSubmit={handleSubmit} className="import-form">
        <label htmlFor="file" className="field-label">
          Upload .xlsx file
        </label>
        <input id="file" name="file" type="file" accept=".xlsx,.xls" />

        <button type="submit" disabled={isLoading} className="button-primary">
          {isLoading ? "Importing..." : "Import Uploaded File"}
        </button>

        <button
          type="button"
          disabled={isLoading}
          className="button-secondary"
          onClick={handleDefaultImport}
        >
          Use Default File in data/raw
        </button>
      </form>

      {importState ? (
        <p className={importState.ok ? "status-ok" : "status-error"}>{importState.message}</p>
      ) : null}
    </div>
  );
}
