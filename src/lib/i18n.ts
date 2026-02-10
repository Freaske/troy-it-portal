export type UiLanguage = "VI" | "EN" | "JA";

export function normalizeUiLanguage(value: unknown, fallback: UiLanguage = "VI"): UiLanguage {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "EN" || normalized === "JA") {
    return normalized;
  }

  return "VI";
}

export function localeByLanguage(language: UiLanguage): string {
  if (language === "EN") {
    return "en-US";
  }
  if (language === "JA") {
    return "ja-JP";
  }

  return "vi-VN";
}

export function languageLabel(language: UiLanguage): string {
  if (language === "EN") {
    return "English";
  }
  if (language === "JA") {
    return "日本語";
  }

  return "Tiếng Việt";
}

type Translated = Record<UiLanguage, string>;

const STRINGS = {
  navDashboard: {
    VI: "Lịch học",
    EN: "Dashboard",
    JA: "ダッシュボード",
  },
  navCourses: {
    VI: "Học phần",
    EN: "Courses",
    JA: "科目",
  },
  navFaculty: {
    VI: "Giảng viên",
    EN: "Faculty",
    JA: "教員",
  },
  navProfile: {
    VI: "Hồ sơ",
    EN: "Profile",
    JA: "プロフィール",
  },
  navGpa: {
    VI: "GPA",
    EN: "GPA",
    JA: "GPA",
  },
  navResources: {
    VI: "Học liệu",
    EN: "Resources",
    JA: "資料",
  },
  navImport: {
    VI: "Nhập dữ liệu",
    EN: "Import",
    JA: "インポート",
  },
  navAdmin: {
    VI: "Quản trị học vụ",
    EN: "Academic Admin",
    JA: "学務管理",
  },
  authSignIn: {
    VI: "Đăng nhập",
    EN: "Sign in",
    JA: "ログイン",
  },
  authRegister: {
    VI: "Đăng ký",
    EN: "Register",
    JA: "新規登録",
  },
  roleAdmin: {
    VI: "Quản trị viên",
    EN: "Administrator",
    JA: "管理者",
  },
  roleStudent: {
    VI: "Sinh viên",
    EN: "Student",
    JA: "学生",
  },
  roleLecturer: {
    VI: "Giảng viên",
    EN: "Lecturer",
    JA: "教員",
  },
  footerTagline: {
    VI: "Hệ thống quản trị học vụ, học liệu và đánh giá giảng dạy theo chuẩn đại học.",
    EN: "University-grade portal for timetable operations, course intelligence, and learning resources.",
    JA: "時間割運用・授業評価・学習資料を統合した大学向けポータルです。",
  },
  headerProgram: {
    VI: "Hanoi University of Science and Technology · Troy University IT Program",
    EN: "Hanoi University of Science and Technology · Troy University IT Program",
    JA: "ハノイ工科大学 · Troy University IT Program",
  },
  headerSubline: {
    VI: "Trung tâm dịch vụ học vụ · Lịch học · Học liệu · Đánh giá giảng viên",
    EN: "Academic Services Center · Timetable · Learning Resources · Faculty Ratings",
    JA: "学務サービスセンター · 時間割 · 学習資料 · 教員評価",
  },
} satisfies Record<string, Translated>;

export type UiKey = keyof typeof STRINGS;

export function t(language: UiLanguage, key: UiKey): string {
  return STRINGS[key][language];
}
