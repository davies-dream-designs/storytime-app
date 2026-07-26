// Shared visual styling for error/event severities + domains (client-safe).
import type { ErrorSeverity } from "@/lib/errors";

export const SEVERITY_STYLES: Record<ErrorSeverity, string> = {
  info: "bg-night-100 text-night-600",
  warning: "bg-yellow-100 text-yellow-800",
  error: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-700",
};

export const SEVERITY_DOT: Record<ErrorSeverity, string> = {
  info: "bg-night-400",
  warning: "bg-yellow-500",
  error: "bg-orange-500",
  critical: "bg-red-600",
};

export const DOMAIN_STYLE = "bg-blush-100 text-blush-700";

export function formatAuDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Adelaide",
    dateStyle: "short",
    timeStyle: "short",
  });
}
