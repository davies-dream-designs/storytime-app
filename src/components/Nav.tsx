"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useAuth, SignInButton, UserButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { buttonClassName } from "@/components/ui/buttonStyles";

export default function Nav() {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    isAdmin: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/user/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCreditInfo(d as { credits: number; isAdmin: boolean }); })
      .catch(() => {});
  }, [isSignedIn]);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const logoHref = isSignedIn ? "/dashboard" : "/";
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/stories" && pathname.startsWith("/stories/new"))
      return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const navLinkClass = (href: string) =>
    `rounded-full px-4 py-2 text-sm font-bold transition ${
      isActive(href)
        ? "bg-night-700 text-moon-200 shadow-sm shadow-night-700/20"
        : "text-night-600 hover:bg-night-100"
    }`;
  const mobileLinkClass = (href: string) =>
    `rounded-xl px-4 py-3 text-sm font-bold transition ${
      isActive(href)
        ? "bg-night-700 text-moon-200 shadow-sm shadow-night-700/20"
        : "text-night-700 hover:bg-night-50"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-night-100 bg-parchment/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 pr-6">
        <Link
          href={logoHref}
          className="flex items-center gap-2 font-display text-xl font-bold text-night-700"
          onClick={() => setOpen(false)}
        >
          <Image
            src="/icon-light.svg"
            alt=""
            width={32}
            height={32}
            className="rounded-lg"
            aria-hidden
          />
          Storycot
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          {isSignedIn ? (
            <>
              <Link
                href="/profiles"
                aria-current={isActive("/profiles") ? "page" : undefined}
                className={navLinkClass("/profiles")}
              >
                {t("profiles")}
              </Link>
              <Link
                href="/stories"
                aria-current={isActive("/stories") ? "page" : undefined}
                className={navLinkClass("/stories")}
              >
                {t("stories")}
              </Link>
              <Link
                href="/books"
                aria-current={isActive("/books") ? "page" : undefined}
                className={navLinkClass("/books")}
              >
                {t("books")}
              </Link>
              <Link
                href="/stories/new"
                aria-current={isActive("/stories/new") ? "page" : undefined}
                className={`whitespace-nowrap ${navLinkClass("/stories/new")}`}
              >
                {t("newStory")}
              </Link>
              <Link
                href="/account"
                aria-current={isActive("/account") ? "page" : undefined}
                className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold transition ${isActive("/account") ? "bg-night-700 text-moon-200 shadow-sm shadow-night-700/20" : "text-night-500 hover:bg-night-100"}`}
                title={t("accountCredits")}
              >
                ✨
                {creditInfo && !creditInfo.isAdmin ? (
                  <span
                    className={`min-w-[1.25rem] rounded-full px-1 text-center text-xs ${
                      creditInfo.credits === 0
                        ? "bg-red-100 text-red-600"
                        : "bg-night-100 text-night-600"
                    }`}
                  >
                    {creditInfo.credits}
                  </span>
                ) : null}
              </Link>
              {creditInfo?.isAdmin ? (
                <Link
                  href="/admin"
                  aria-current={isActive("/admin") ? "page" : undefined}
                  className={`rounded-full px-3 py-2 text-xs font-bold transition ${isActive("/admin") ? "bg-night-700 text-moon-200" : "text-night-400 hover:bg-night-100"}`}
                >
                  Admin
                </Link>
              ) : null}
              <LanguageSwitcher />
              <UserButton />
            </>
          ) : (
            <>
              <LanguageSwitcher />
              <SignInButton mode="modal">
                <button className={buttonClassName({ size: "compact" })}>
                  {t("signIn")}
                </button>
              </SignInButton>
            </>
          )}
        </div>

        {/* Mobile: avatar + hamburger */}
        <div className="flex sm:hidden items-center gap-3">
          <LanguageSwitcher />
          {isSignedIn ? (
            <>
              <UserButton />
              <button
                onClick={() => setOpen((o) => !o)}
                className="rounded-lg p-2 text-night-600 transition hover:bg-night-100"
                aria-label={open ? t("closeMenu") : t("openMenu")}
              >
                {open ? (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <SignInButton mode="modal">
              <button className={buttonClassName({ size: "compact" })}>
                {t("signIn")}
              </button>
            </SignInButton>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && isSignedIn && (
        <div className="sm:hidden border-t border-night-100 bg-parchment/95 backdrop-blur px-4 py-3 flex flex-col gap-1">
          <Link
            href="/dashboard"
            aria-current={isActive("/dashboard") ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={mobileLinkClass("/dashboard")}
          >
            {t("dashboard")}
          </Link>
          <Link
            href="/profiles"
            aria-current={isActive("/profiles") ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={mobileLinkClass("/profiles")}
          >
            {t("profilesMobile")}
          </Link>
          <Link
            href="/stories"
            aria-current={isActive("/stories") ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={mobileLinkClass("/stories")}
          >
            {t("storiesMobile")}
          </Link>
          <Link
            href="/books"
            aria-current={isActive("/books") ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={mobileLinkClass("/books")}
          >
            {t("booksMobile")}
          </Link>
          <Link
            href="/account"
            aria-current={isActive("/account") ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between ${mobileLinkClass("/account")}`}
          >
            {t("accountMobile")}
            {creditInfo && !creditInfo.isAdmin ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  creditInfo.credits === 0
                    ? "bg-red-100 text-red-600"
                    : "bg-night-100 text-night-600"
                }`}
              >
                {creditInfo.credits} ✨
              </span>
            ) : null}
          </Link>
          <Link
            href="/stories/new"
            onClick={() => setOpen(false)}
            className={buttonClassName({ className: "mt-2 w-full" })}
          >
            {t("newStory")}
          </Link>
        </div>
      )}
    </header>
  );
}
