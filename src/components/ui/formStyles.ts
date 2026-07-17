import { joinClasses } from "@/components/ui/buttonStyles";

export const formStyles = {
  label: "mb-1.5 block text-sm font-bold text-night-700",
  subLabel: "mb-1 block text-xs font-medium text-night-500",
  hint: "mb-3 text-xs text-night-400",
  field:
    "w-full rounded-xl border border-night-200 bg-white px-4 py-2.5 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200",
  select:
    "w-full rounded-xl border border-night-200 bg-white px-3 py-2.5 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200",
  textarea:
    "w-full rounded-xl border border-night-200 bg-white px-4 py-2.5 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200",
  error: "rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-600",
  dangerPanel:
    "rounded-2xl border border-blush-200 bg-blush-100 p-6 text-center",
};

export function choiceCardClassName(selected: boolean, className?: string) {
  return joinClasses(
    "rounded-2xl border-2 bg-white transition",
    selected
      ? "border-star-400 bg-star-50"
      : "border-night-200 hover:border-night-300",
    className
  );
}

export function pillClassName(selected: boolean, className?: string) {
  return joinClasses(
    "rounded-full border px-4 py-1.5 text-sm font-bold transition",
    selected
      ? "border-night-700 bg-night-700 text-moon-200"
      : "border-night-200 bg-white text-night-600 hover:border-night-400 hover:bg-night-50",
    className
  );
}
