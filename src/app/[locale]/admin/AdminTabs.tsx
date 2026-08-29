"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const TABS = [
  { id: "overview",   label: "Overview" },
  { id: "content",    label: "Content" },
  { id: "rewards",    label: "Rewards" },
  { id: "print",      label: "Print" },
  { id: "customers",  label: "Customers" },
  { id: "tools",      label: "Tools" },
] as const;

export type AdminTab = (typeof TABS)[number]["id"];

export function getActiveTab(raw: string | undefined): AdminTab {
  const found = TABS.find((t) => t.id === raw);
  return found ? found.id : "overview";
}

export default function AdminTabs({ active }: { active: AdminTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (id: AdminTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="mb-8 flex flex-wrap gap-1 rounded-2xl border border-night-100 bg-white p-1.5 shadow-sm">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => navigate(tab.id)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            active === tab.id
              ? "bg-night-800 text-white shadow-sm"
              : "text-night-500 hover:bg-night-50 hover:text-night-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
