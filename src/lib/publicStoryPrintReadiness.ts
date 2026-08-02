import type { BookProject } from "@/types/printBook";
import { hasBlockingProofingIssue } from "@/lib/print-books/readiness";

export type PublicStoryPrintReadiness = {
  bookProjectId: string;
  ready: boolean;
  label: string;
  detail: string;
};

function hasPublicOrderableState(project: Pick<BookProject, "assets">) {
  return (
    project.assets.orderabilityState === "export_ready" ||
    project.assets.orderabilityState === "order_ready"
  );
}

export function getPublicStoryPrintReadiness(
  projects: BookProject[]
): PublicStoryPrintReadiness | undefined {
  if (projects.length === 0) return undefined;

  const readyProject = projects.find(
    (project) =>
      project.status === "ready" &&
      hasPublicOrderableState(project) &&
      !hasBlockingProofingIssue(project) &&
      Boolean(project.assets.luluCoverPdfUrl) &&
      Boolean(project.assets.luluPrintPdfUrl)
  );
  if (readyProject) {
    return {
      bookProjectId: readyProject.id,
      ready: true,
      label: "Print-ready",
      detail: "Lulu-ready files are available.",
    };
  }

  const newestProject = [...projects].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )[0];
  return {
    bookProjectId: newestProject.id,
    ready: false,
    label:
      newestProject.status === "ready"
        ? "Needs print check"
        : "Book not ready yet",
    detail:
      newestProject.status === "ready"
        ? "Book exists but is not marked order-ready for Lulu."
        : "No completed print-ready book exists for this story.",
  };
}
