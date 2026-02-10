import fs from "node:fs";
import path from "node:path";

import {
  DayOfWeek,
  PrismaClient,
  SessionPeriod,
  type Prisma,
} from "@prisma/client";
import * as XLSX from "xlsx";

type ParsedCourseMeta = {
  code: string;
  nameEn: string | null;
  nameVi: string | null;
  credits: number | null;
  prerequisite: string | null;
};

type ParsedEvent = {
  classGroupName: string;
  dayOfWeek: DayOfWeek;
  session: SessionPeriod;
  startTime: string | null;
  rawTime: string | null;
  room: string | null;
  courseCode: string;
  sourceSheet: string;
  sourceRow: number;
};

type ParsedSheetData = {
  sheetName: string;
  cohortCode: string;
  semesterLabel: string;
  semesterKey: string;
  startDate: Date | null;
  endDate: Date | null;
  events: ParsedEvent[];
  catalog: Map<string, ParsedCourseMeta>;
};

export type ImportSummary = {
  sourceFile: string;
  semesterKey: string;
  semesterLabel: string;
  cohorts: string[];
  classGroups: number;
  courses: number;
  entries: number;
};

const DAY_COLUMN_MAP: Record<number, DayOfWeek> = {
  2: DayOfWeek.MON,
  3: DayOfWeek.TUE,
  4: DayOfWeek.WED,
  5: DayOfWeek.THU,
  6: DayOfWeek.FRI,
  7: DayOfWeek.SAT,
};

const SHEET_FILTER = /^SPRING\s+2026\s+K\d+$/i;

function cleanCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeCourseCode(raw: string): string | null {
  const text = cleanCell(raw).toUpperCase().replace(/\s+/g, " ");
  if (!text) {
    return null;
  }

  const compact = text.replace(/\s+/g, "");
  const matched = compact.match(/^([A-Z]{2,4})(\d{3,4})$/);
  if (!matched) {
    return null;
  }

  return `${matched[1]} ${matched[2]}`;
}

function normalizeClassGroup(raw: string): string | null {
  const matched = raw.toUpperCase().match(/IT\s*0?(\d{1,2})/);
  if (!matched) {
    return null;
  }

  const index = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(index)) {
    return null;
  }

  return `IT ${String(index).padStart(2, "0")}`;
}

function expandClassGroups(label: string): string[] {
  const numbers = [...label.toUpperCase().matchAll(/IT\s*0?(\d{1,2})/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));

  if (numbers.length === 0) {
    return [];
  }

  if (numbers.length >= 2 && label.includes("-")) {
    const [start, end] = [numbers[0], numbers[1]];
    if (start < end && end - start <= 20) {
      const expanded: string[] = [];
      for (let current = start; current <= end; current += 1) {
        expanded.push(`IT ${String(current).padStart(2, "0")}`);
      }
      return expanded;
    }
  }

  return [...new Set(numbers.map((value) => `IT ${String(value).padStart(2, "0")}`))];
}

function getSessionPeriod(label: string): SessionPeriod {
  const normalized = foldText(label);

  if (normalized.includes("sang") || normalized.includes("morning")) {
    return SessionPeriod.MORNING;
  }

  if (normalized.includes("chieu") || normalized.includes("afternoon")) {
    return SessionPeriod.AFTERNOON;
  }

  if (normalized.includes("toi") || normalized.includes("evening")) {
    return SessionPeriod.EVENING;
  }

  return SessionPeriod.UNKNOWN;
}

function parseDateValue(raw: string): Date | null {
  const text = cleanCell(raw);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseDuration(text: string): { startDate: Date | null; endDate: Date | null } {
  const matched = text.match(/DURATION\s*:\s*(.+?)\s*-\s*(.+)$/i);
  if (!matched) {
    return { startDate: null, endDate: null };
  }

  return {
    startDate: parseDateValue(matched[1]),
    endDate: parseDateValue(matched[2]),
  };
}

function parseSemesterLabel(sheetName: string, rows: unknown[][]): string {
  const topText = cleanCell(rows[0]?.[1]);
  const matched = topText.match(/SCHEDULE\s+FOR\s+(.+?)\s*-\s*K\d+/i);
  if (matched) {
    return matched[1].trim().toUpperCase();
  }

  const fallback = sheetName.match(/(SPRING\s+\d{4})/i);
  return fallback ? fallback[1].toUpperCase() : sheetName.toUpperCase();
}

function parseSemesterKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function looksLikeClassGroupRow(value: string): boolean {
  return /IT\s*0?\d{1,2}/i.test(value) && !/room|time|sáng|chiều|morning|afternoon/i.test(value);
}

function parseScheduleCell(cellText: string): {
  classHint: string | null;
  courseCode: string;
  room: string | null;
  rawTime: string | null;
  startTime: string | null;
} | null {
  const lines = cellText
    .split(/\r?\n/)
    .map((line) => cleanCell(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const courseCode = normalizeCourseCode(lines[0]);
  if (!courseCode) {
    return null;
  }

  const room = lines[1] ? cleanCell(lines[1]) : null;
  const rawTime = lines[2] ? cleanCell(lines[2]) : null;

  const timeText = rawTime ?? cellText;
  const matchedTime = timeText.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  const matchedClass = timeText.match(/IT\s*0?\d{1,2}/i);

  return {
    classHint: matchedClass ? normalizeClassGroup(matchedClass[0]) : null,
    courseCode,
    room,
    rawTime,
    startTime: matchedTime ? matchedTime[0] : null,
  };
}

function parseCatalog(rows: unknown[][]): Map<string, ParsedCourseMeta> {
  const catalog = new Map<string, ParsedCourseMeta>();
  const catalogHeaderIndex = rows.findIndex((row) => {
    const value = foldText(cleanCell(row[1]));
    return value.includes("ma hp");
  });

  if (catalogHeaderIndex < 0) {
    return catalog;
  }

  let blankCount = 0;
  for (let rowIndex = catalogHeaderIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const codeText = cleanCell(row[1]);

    if (/contact customer service|buy me a coffee|note:/i.test(codeText)) {
      break;
    }

    const code = normalizeCourseCode(codeText);
    if (!code) {
      blankCount += 1;
      if (blankCount > 20) {
        break;
      }
      continue;
    }

    blankCount = 0;
    const creditsValue = Number.parseInt(cleanCell(row[6]), 10);

    catalog.set(code, {
      code,
      nameEn: cleanCell(row[2]) || null,
      nameVi: cleanCell(row[4]) || null,
      credits: Number.isFinite(creditsValue) ? creditsValue : null,
      prerequisite: cleanCell(row[7]) || null,
    });
  }

  return catalog;
}

function parseSheet(sheetName: string, rows: unknown[][]): ParsedSheetData {
  const cohortMatched = sheetName.match(/K\d+/i);
  if (!cohortMatched) {
    throw new Error(`Could not find cohort code in sheet ${sheetName}`);
  }

  const cohortCode = cohortMatched[0].toUpperCase();
  const semesterLabel = parseSemesterLabel(sheetName, rows);
  const semesterKey = parseSemesterKey(semesterLabel);

  const durationRow = rows.find((row) => /DURATION\s*:/i.test(cleanCell(row[1])));
  const { startDate, endDate } = parseDuration(cleanCell(durationRow?.[1]));

  const headerIndex = rows.findIndex((row) => {
    const column1 = foldText(cleanCell(row[1]));
    const column2 = foldText(cleanCell(row[2]));
    const column3 = foldText(cleanCell(row[3]));
    return column1 === "time" && column2 === "mon" && column3 === "tue";
  });

  if (headerIndex < 0) {
    throw new Error(`Could not find schedule header row in sheet ${sheetName}`);
  }

  const events: ParsedEvent[] = [];
  let currentGroups: string[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const firstColumn = cleanCell(row[1]);

    if (/tba\s*=|website for registering|contact customer service/i.test(firstColumn)) {
      break;
    }

    if (looksLikeClassGroupRow(firstColumn)) {
      currentGroups = expandClassGroups(firstColumn);
      continue;
    }

    const session = getSessionPeriod(firstColumn);
    if (session === SessionPeriod.UNKNOWN) {
      continue;
    }

    for (const [columnIndexText, dayOfWeek] of Object.entries(DAY_COLUMN_MAP)) {
      const columnIndex = Number.parseInt(columnIndexText, 10);
      const cellValue = cleanCell(row[columnIndex]);
      if (!cellValue) {
        continue;
      }

      const parsedCell = parseScheduleCell(cellValue);
      if (!parsedCell) {
        continue;
      }

      const targetGroups = parsedCell.classHint
        ? currentGroups.includes(parsedCell.classHint)
          ? [parsedCell.classHint]
          : [parsedCell.classHint]
        : currentGroups;

      if (targetGroups.length === 0) {
        continue;
      }

      for (const classGroupName of targetGroups) {
        events.push({
          classGroupName,
          dayOfWeek,
          session,
          startTime: parsedCell.startTime,
          rawTime: parsedCell.rawTime,
          room: parsedCell.room,
          courseCode: parsedCell.courseCode,
          sourceSheet: sheetName,
          sourceRow: rowIndex + 1,
        });
      }
    }
  }

  return {
    sheetName,
    cohortCode,
    semesterLabel,
    semesterKey,
    startDate,
    endDate,
    events,
    catalog: parseCatalog(rows),
  };
}

function parseWorkbook(workbook: XLSX.WorkBook): ParsedSheetData[] {
  const targetSheets = workbook.SheetNames.filter((sheetName) => SHEET_FILTER.test(sheetName));

  if (targetSheets.length === 0) {
    throw new Error("No target sheets matched pattern SPRING 2026 Kxx.");
  }

  return targetSheets.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as unknown[][];

    return parseSheet(sheetName, rows);
  });
}

async function writeImport(
  prisma: PrismaClient,
  parsedSheets: ParsedSheetData[],
  sourceFile: string,
): Promise<ImportSummary> {
  const semesterLabel = parsedSheets[0].semesterLabel;
  const semesterKey = parsedSheets[0].semesterKey;

  const allStarts = parsedSheets.map((sheet) => sheet.startDate).filter((value): value is Date => Boolean(value));
  const allEnds = parsedSheets.map((sheet) => sheet.endDate).filter((value): value is Date => Boolean(value));

  const importRun = await prisma.importRun.create({
    data: {
      sourceFile,
      status: "RUNNING",
      note: `Preparing import for ${semesterLabel}`,
    },
  });

  try {
    const semester = await prisma.semester.upsert({
      where: {
        key: semesterKey,
      },
      update: {
        label: semesterLabel,
        sourceFile,
        startDate: allStarts.length > 0 ? new Date(Math.min(...allStarts.map((value) => value.getTime()))) : null,
        endDate: allEnds.length > 0 ? new Date(Math.max(...allEnds.map((value) => value.getTime()))) : null,
      },
      create: {
        key: semesterKey,
        label: semesterLabel,
        sourceFile,
        startDate: allStarts.length > 0 ? new Date(Math.min(...allStarts.map((value) => value.getTime()))) : null,
        endDate: allEnds.length > 0 ? new Date(Math.max(...allEnds.map((value) => value.getTime()))) : null,
      },
    });

    let totalEntries = 0;
    let totalClassGroups = 0;
    const allCourseCodes = new Set<string>();

    for (const parsedSheet of parsedSheets) {
      const cohort = await prisma.cohort.upsert({
        where: {
          semesterId_code: {
            semesterId: semester.id,
            code: parsedSheet.cohortCode,
          },
        },
        update: {},
        create: {
          semesterId: semester.id,
          code: parsedSheet.cohortCode,
        },
      });

      const existingClassGroups = await prisma.classGroup.findMany({
        where: {
          cohortId: cohort.id,
        },
        select: {
          id: true,
        },
      });

      if (existingClassGroups.length > 0) {
        const existingIds = existingClassGroups.map((item) => item.id);
        await prisma.scheduleEntry.deleteMany({
          where: {
            classGroupId: {
              in: existingIds,
            },
          },
        });

        await prisma.classGroup.deleteMany({
          where: {
            id: {
              in: existingIds,
            },
          },
        });
      }

      const groupNames = [...new Set(parsedSheet.events.map((event) => event.classGroupName))].sort((a, b) =>
        a.localeCompare(b),
      );

      if (groupNames.length > 0) {
        await prisma.classGroup.createMany({
          data: groupNames.map((name) => ({
            name,
            cohortId: cohort.id,
          })),
        });
      }

      totalClassGroups += groupNames.length;

      const cohortClassGroups = await prisma.classGroup.findMany({
        where: {
          cohortId: cohort.id,
        },
      });

      const classGroupIdByName = new Map(cohortClassGroups.map((group) => [group.name, group.id]));

      const cohortCourseCodes = new Set<string>();
      for (const event of parsedSheet.events) {
        cohortCourseCodes.add(event.courseCode);
      }
      for (const code of parsedSheet.catalog.keys()) {
        cohortCourseCodes.add(code);
      }

      for (const code of cohortCourseCodes) {
        const meta = parsedSheet.catalog.get(code);
        allCourseCodes.add(code);

        const updateData: Prisma.CourseUpdateInput = {};

        if (meta?.nameEn) {
          updateData.nameEn = meta.nameEn;
        }
        if (meta?.nameVi) {
          updateData.nameVi = meta.nameVi;
        }
        if (typeof meta?.credits === "number") {
          updateData.credits = meta.credits;
        }
        if (meta?.prerequisite) {
          updateData.prerequisite = meta.prerequisite;
        }

        await prisma.course.upsert({
          where: {
            code,
          },
          update: updateData,
          create: {
            code,
            nameEn: meta?.nameEn ?? null,
            nameVi: meta?.nameVi ?? null,
            credits: meta?.credits ?? null,
            prerequisite: meta?.prerequisite ?? null,
          },
        });
      }

      const courseRecords = await prisma.course.findMany({
        where: {
          code: {
            in: [...cohortCourseCodes],
          },
        },
        select: {
          id: true,
          code: true,
        },
      });

      const courseIdByCode = new Map(courseRecords.map((course) => [course.code, course.id]));

      const entryData: Prisma.ScheduleEntryCreateManyInput[] = [];
      for (const event of parsedSheet.events) {
        const classGroupId = classGroupIdByName.get(event.classGroupName);
        const courseId = courseIdByCode.get(event.courseCode);

        if (!classGroupId || !courseId) {
          continue;
        }

        entryData.push({
          semesterId: semester.id,
          classGroupId,
          courseId,
          dayOfWeek: event.dayOfWeek,
          session: event.session,
          startTime: event.startTime,
          rawTime: event.rawTime,
          room: event.room,
          sourceSheet: event.sourceSheet,
          sourceRow: event.sourceRow,
        });
      }

      if (entryData.length > 0) {
        await prisma.scheduleEntry.createMany({
          data: entryData,
        });
      }

      totalEntries += entryData.length;
    }

    await prisma.importRun.update({
      where: {
        id: importRun.id,
      },
      data: {
        semesterId: semester.id,
        status: "SUCCESS",
        note: `Imported ${totalEntries} schedule entries`,
        finishedAt: new Date(),
      },
    });

    return {
      sourceFile,
      semesterKey,
      semesterLabel,
      cohorts: parsedSheets.map((sheet) => sheet.cohortCode),
      classGroups: totalClassGroups,
      courses: allCourseCodes.size,
      entries: totalEntries,
    };
  } catch (error) {
    await prisma.importRun.update({
      where: {
        id: importRun.id,
      },
      data: {
        status: "FAILED",
        note: error instanceof Error ? error.message : "Unknown import error",
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}

export async function importWorkbookFromPath(
  prisma: PrismaClient,
  workbookPath: string,
): Promise<ImportSummary> {
  const resolvedPath = path.resolve(workbookPath);
  const workbookBuffer = fs.readFileSync(resolvedPath);
  const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
  const parsedSheets = parseWorkbook(workbook);
  return writeImport(prisma, parsedSheets, resolvedPath);
}

export async function importWorkbookFromBuffer(
  prisma: PrismaClient,
  buffer: Buffer,
  sourceName: string,
): Promise<ImportSummary> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parsedSheets = parseWorkbook(workbook);
  return writeImport(prisma, parsedSheets, sourceName);
}

export function resolveDefaultWorkbookPath(): string {
  const fallbackPath = path.resolve(process.cwd(), "data/raw/TKB Troy-IT SPRING 26.xlsx");
  if (!fs.existsSync(fallbackPath)) {
    throw new Error(`Workbook file not found at ${fallbackPath}`);
  }

  return fallbackPath;
}
