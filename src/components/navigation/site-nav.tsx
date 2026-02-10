"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { t, type UiLanguage } from "@/lib/i18n";
import type { UserRole } from "@/lib/auth/session";

type NavItem = {
  href: string;
  labelKey:
    | "navDashboard"
    | "navCourses"
    | "navFaculty"
    | "navProfile"
    | "navGpa"
    | "navResources"
    | "navImport"
    | "navAdmin";
  match: readonly string[];
  roles: readonly UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    labelKey: "navDashboard",
    match: ["/"],
    roles: ["ADMIN", "STUDENT", "LECTURER"],
  },
  {
    href: "/courses",
    labelKey: "navCourses",
    match: ["/courses"],
    roles: ["ADMIN", "STUDENT", "LECTURER"],
  },
  {
    href: "/lecturers",
    labelKey: "navFaculty",
    match: ["/lecturers"],
    roles: ["ADMIN", "STUDENT", "LECTURER"],
  },
  {
    href: "/profile",
    labelKey: "navProfile",
    match: ["/profile"],
    roles: ["ADMIN", "STUDENT", "LECTURER"],
  },
  {
    href: "/gpa",
    labelKey: "navGpa",
    match: ["/gpa"],
    roles: ["STUDENT"],
  },
  {
    href: "/resources",
    labelKey: "navResources",
    match: ["/resources"],
    roles: ["ADMIN", "STUDENT", "LECTURER"],
  },
  {
    href: "/admin/academic",
    labelKey: "navAdmin",
    match: ["/admin/academic"],
    roles: ["ADMIN"],
  },
  {
    href: "/admin/import",
    labelKey: "navImport",
    match: ["/admin/import"],
    roles: ["ADMIN"],
  },
];

function isActive(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => {
    if (prefix === "/") {
      return pathname === "/";
    }

    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

type SiteNavProps = {
  role: UserRole;
  language: UiLanguage;
};

export function SiteNav({ role, language }: SiteNavProps) {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="Main navigation">
      {NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => {
        const active = isActive(pathname, item.match);

        return (
          <Link key={item.href} href={item.href} className={`nav-link${active ? " active" : ""}`}>
            {t(language, item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
