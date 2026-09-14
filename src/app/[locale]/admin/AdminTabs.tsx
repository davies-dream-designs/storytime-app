// No "use client" needed — pure server-renderable anchor links.

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
  return (
    <div className="mb-8 flex flex-wrap gap-1 rounded-2xl border border-night-100 bg-white p-1.5 shadow-sm">
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={`?tab=${tab.id}`}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            active === tab.id
              ? "bg-night-800 text-white shadow-sm"
              : "text-night-500 hover:bg-night-50 hover:text-night-800"
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  );
}
