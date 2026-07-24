import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export default async function BookProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const [{ userId }, { id }, query] = await Promise.all([
    auth(),
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  if (!userId) redirect("/sign-in");

  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) notFound();

  // Pass through any checkout result query params so the story page can show banners
  const qs = new URLSearchParams(query as Record<string, string>).toString();
  const destination = `/stories/${project.sourceStoryId}${qs ? `?${qs}` : ""}`;
  redirect(destination);
}
