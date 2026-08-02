export type IconName =
  | "account"
  | "admin"
  | "arrowLeft"
  | "arrowRight"
  | "book"
  | "check"
  | "dashboard"
  | "download"
  | "faq"
  | "file"
  | "gift"
  | "image"
  | "link"
  | "lock"
  | "plus"
  | "print"
  | "profile"
  | "refresh"
  | "search"
  | "share"
  | "sparkle"
  | "terms"
  | "trash"
  | "zip";

const iconPaths: Record<IconName, string> = {
  account:
    "M12 3l1.7 4.8 4.8 1.7-4.8 1.7L12 16l-1.7-4.8-4.8-1.7 4.8-1.7L12 3z M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z",
  admin:
    "M12 3l7 3v5c0 4.1-2.8 7.9-7 9-4.2-1.1-7-4.9-7-9V6l7-3z M9.5 12.5l1.8 1.8 3.7-4.1",
  arrowLeft: "M19 12H5 M11 6l-6 6 6 6",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  book: "M5 5.5A3.5 3.5 0 018.5 2H20v16H8.5A3.5 3.5 0 005 21.5v-16z M5 5.5A3.5 3.5 0 001.5 2H1v16h.5A3.5 3.5 0 015 21.5",
  check: "M20 6L9 17l-5-5",
  dashboard: "M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9z",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
  faq: "M12 18h.01 M9.4 9a2.8 2.8 0 115 1.7c-.7.6-1.4 1.1-1.8 1.8-.3.4-.5.9-.5 1.5 M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  file: "M7 3h7l4 4v14H7V3z M14 3v5h4 M9 13h6 M9 17h6",
  gift: "M20 12v8H4v-8 M2 7h20v5H2V7z M12 7v13 M12 7H8.5A2.5 2.5 0 118.5 2C11 2 12 7 12 7z M12 7h3.5A2.5 2.5 0 1015.5 2C13 2 12 7 12 7z",
  image: "M4 5h16v14H4V5z M8 14l2.5-3 2 2.5L15 10l5 6 M8 9h.01",
  link: "M10 13a5 5 0 007.1 0l2-2a5 5 0 00-7.1-7.1l-1.1 1.1 M14 11a5 5 0 00-7.1 0l-2 2A5 5 0 0012 20.1l1.1-1.1",
  lock: "M7 10V7a5 5 0 0110 0v3 M6 10h12v10H6V10z",
  plus: "M12 5v14 M5 12h14",
  print:
    "M7 8V3h10v5 M7 17H5a2 2 0 01-2-2v-3a2 2 0 012-2h14a2 2 0 012 2v3a2 2 0 01-2 2h-2 M7 14h10v7H7v-7z",
  profile: "M12 12a4 4 0 100-8 4 4 0 000 8z M4 21a8 8 0 0116 0",
  refresh:
    "M20 6v5h-5 M4 18v-5h5 M18.5 9A7 7 0 006 7.5L4 10 M5.5 15A7 7 0 0018 16.5l2-2.5",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3",
  share: "M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7 M16 6l-4-4-4 4 M12 2v14",
  sparkle: "M12 3l1.7 4.8 4.8 1.7-4.8 1.7L12 16l-1.7-4.8-4.8-1.7 4.8-1.7L12 3z",
  terms: "M7 3h7l4 4v14H7V3z M14 3v5h4 M9 13h6 M9 17h6",
  trash: "M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 11v6 M14 11v6",
  zip: "M8 3h8l4 4v14H8V3z M16 3v5h4 M11 6h2 M11 9h2 M11 12h2 M11 15h3v3h-3v-3z",
};

export default function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
