import Link from "next/link";

import { getAcademicBundle } from "@/lib/academic-data";
import { normalizeSearchText } from "@/lib/knowledge";

type ResourcesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ResourceRow = {
  courseCode: string;
  courseName: string | null;
  path: string;
  extension: string;
  sizeBytes: number;
};

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

export default async function ResourcesPage({ searchParams }: ResourcesPageProps) {
  const query = await searchParams;

  const q = single(query.q);
  const selectedCourse = single(query.course);
  const selectedExt = single(query.ext);

  const data = await getAcademicBundle();
  const resources: ResourceRow[] = data.courses.flatMap((course) =>
    course.resources.map((resource) => ({
      courseCode: course.code,
      courseName: course.nameEn ?? course.nameVi,
      path: resource.relativePath,
      extension: resource.extension,
      sizeBytes: resource.sizeBytes,
    })),
  );

  const courses = [...new Set(resources.map((resource) => resource.courseCode))].sort((a, b) =>
    a.localeCompare(b),
  );
  const extensions = [...new Set(resources.map((resource) => resource.extension))].sort((a, b) =>
    a.localeCompare(b),
  );

  const normalizedQ = normalizeSearchText(q.trim());
  const filtered = resources.filter((resource) => {
    if (selectedCourse && resource.courseCode !== selectedCourse) {
      return false;
    }

    if (selectedExt && resource.extension !== selectedExt) {
      return false;
    }

    if (!normalizedQ) {
      return true;
    }

    return (
      normalizeSearchText(resource.courseCode).includes(normalizedQ) ||
      normalizeSearchText(resource.courseName ?? "").includes(normalizedQ) ||
      normalizeSearchText(resource.path).includes(normalizedQ) ||
      normalizeSearchText(resource.extension).includes(normalizedQ)
    );
  });

  const byExtension = new Map<string, number>();
  for (const item of filtered) {
    byExtension.set(item.extension, (byExtension.get(item.extension) ?? 0) + 1);
  }

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">Resource Hub</p>
        <h1>Academic Resource Library</h1>
        <p>
          Kho tài liệu học tập tập trung theo từng môn học. Bạn có thể tìm nhanh, lọc theo định dạng và preview
          trực tiếp PDF/PPTX/DOCX/Markdown trên web.
        </p>
        <div className="chip-row">
          <span className="chip">{resources.length} total files</span>
          <span className="chip">{filtered.length} files in filter</span>
          <span className="chip">{courses.length} courses</span>
          <span className="chip">{extensions.length} formats</span>
        </div>
      </section>

      <section className="controls-card">
        <form className="resource-filters" method="GET">
          <label>
            Search keyword
            <input name="q" defaultValue={q} placeholder="course code, file name, topic..." />
          </label>

          <label>
            Course
            <select name="course" defaultValue={selectedCourse}>
              <option value="">All courses</option>
              {courses.map((courseCode) => (
                <option key={courseCode} value={courseCode}>
                  {courseCode}
                </option>
              ))}
            </select>
          </label>

          <label>
            File format
            <select name="ext" defaultValue={selectedExt}>
              <option value="">All formats</option>
              {extensions.map((extension) => (
                <option key={extension} value={extension}>
                  {extension.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="button-primary">
            Apply
          </button>
        </form>

        <div className="chip-row">
          {[...byExtension.entries()].slice(0, 8).map(([extension, count]) => (
            <span key={extension} className="chip">
              {extension.toUpperCase()}: {count}
            </span>
          ))}
        </div>
      </section>

      <section className="details-card resource-table-wrap">
        <div className="line-spread">
          <h2>Files</h2>
          <p className="muted-small">Open preview to read directly without downloading.</p>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-state">No resource found with current filters.</p>
        ) : (
          <div className="resource-table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>File</th>
                  <th>Format</th>
                  <th>Size</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 800).map((resource) => (
                  <tr key={`${resource.courseCode}-${resource.path}`}>
                    <td>
                      <Link href={`/courses/${encodeURIComponent(resource.courseCode)}`}>{resource.courseCode}</Link>
                    </td>
                    <td>
                      <div className="resource-file-cell">
                        <strong>{resource.path}</strong>
                        {resource.courseName ? <span>{resource.courseName}</span> : null}
                      </div>
                    </td>
                    <td>{resource.extension.toUpperCase()}</td>
                    <td>{formatSize(resource.sizeBytes)}</td>
                    <td>
                      <Link
                        href={`/resources/view?course=${encodeURIComponent(resource.courseCode)}&path=${encodeURIComponent(resource.path)}`}
                        className="button-secondary resource-action"
                      >
                        Open preview
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
