import path from "node:path";

import { importWorkbookFromPath, resolveDefaultWorkbookPath } from "../src/lib/importers/springSchedule";
import { prisma } from "../src/lib/prisma";

async function main() {
  const input = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : resolveDefaultWorkbookPath();

  const summary = await importWorkbookFromPath(prisma, input);

  console.log("Import completed");
  console.log(`Semester: ${summary.semesterLabel} (${summary.semesterKey})`);
  console.log(`Cohorts: ${summary.cohorts.join(", ")}`);
  console.log(`Class groups: ${summary.classGroups}`);
  console.log(`Courses: ${summary.courses}`);
  console.log(`Schedule entries: ${summary.entries}`);
}

main()
  .catch((error) => {
    console.error("Import failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
