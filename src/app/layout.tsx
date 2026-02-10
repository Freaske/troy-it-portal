import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { SiteNav } from "@/components/navigation/site-nav";
import { getServerSession } from "@/lib/auth/session";
import { localeByLanguage, normalizeUiLanguage, t, type UiLanguage } from "@/lib/i18n";

import "./globals.css";

export const metadata: Metadata = {
  title: "HUST x Troy IT Campus Portal",
  description: "University-style schedule, catalog, resources, and faculty portal",
};

const ROLE_LABEL_KEY: Record<string, "roleAdmin" | "roleStudent" | "roleLecturer"> = {
  ADMIN: "roleAdmin",
  STUDENT: "roleStudent",
  LECTURER: "roleLecturer",
};

const bodyFont = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const headingFont = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
});

const japaneseFont = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  variable: "--font-jp",
  preload: false,
  display: "swap",
});

function htmlLangByUi(language: UiLanguage): string {
  if (language === "EN") {
    return "en";
  }
  if (language === "JA") {
    return "ja";
  }

  return "vi";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  const language = normalizeUiLanguage(session?.language, "VI");
  const locale = localeByLanguage(language);
  const todayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  return (
    <html lang={htmlLangByUi(language)}>
      <body className={`${bodyFont.variable} ${headingFont.variable} ${monoFont.variable} ${japaneseFont.variable} antialiased`}>
        <div className="app-root">
          <header className="site-header">
            <div className="utility-bar">
              <div className="utility-bar-inner">
                <p>{t(language, "headerProgram")}</p>
                <p>{todayLabel}</p>
              </div>
            </div>

            <div className="site-header-inner">
              <div className="brand-wrap">
                <Link href="/" className="brand-link" aria-label="HUST Troy IT Campus Portal">
                  <span className="brand-primary">HUST</span>
                  <span className="brand-divider">×</span>
                  <span className="brand-secondary">Troy IT Campus Portal</span>
                </Link>
                <span className="brand-subline">{t(language, "headerSubline")}</span>
              </div>

              {session ? (
                <div className="header-right">
                  <SiteNav role={session.role} language={language} />
                  <div className="user-badge" aria-label="Logged in user">
                    <span>{session.name}</span>
                    <small>
                      {t(language, ROLE_LABEL_KEY[session.role] ?? "roleStudent")}
                      {session.username ? ` · ${session.username}` : ""}
                    </small>
                  </div>
                  <LogoutButton />
                </div>
              ) : (
                <nav className="site-nav" aria-label="Authentication navigation">
                  <Link className="nav-link active" href="/login">
                    {t(language, "authSignIn")}
                  </Link>
                  <Link className="nav-link" href="/register">
                    {t(language, "authRegister")}
                  </Link>
                </nav>
              )}
            </div>
          </header>

          <div className="app-main">{children}</div>

          <footer className="site-footer">
            <p>HUST · Troy IT Campus Portal</p>
            <p>{t(language, "footerTagline")}</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
