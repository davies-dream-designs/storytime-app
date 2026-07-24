import { notFound } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Nav from "@/components/Nav";
import { db } from "@/lib/db";

export const metadata = { title: "Admin — Storycot" };

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) notFound();

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true) notFound();

  const failedIds = await db.bookProjects.getFailedIndex();
  const projects = (
    await Promise.all(failedIds.map((id) => db.bookProjects.getById(id)))
  ).filter(Boolean);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-display text-3xl font-bold text-night-800 mb-2">
          Admin — Failed Books
        </h1>
        <p className="mb-8 text-night-400 text-sm">
          {projects.length} failed project{projects.length !== 1 ? "s" : ""} (most recent first)
        </p>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-night-100 bg-white p-8 text-center text-night-400">
            No failed books. Nice.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {projects.map((p) => (
              <div
                key={p!.id}
                className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-mono text-xs text-night-400">
                      {p!.id}
                    </p>
                    <p className="text-sm text-night-500 mt-0.5">
                      user: <span className="font-mono">{p!.userId}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-blush-100 px-3 py-1 text-xs font-bold text-blush-700">
                      {p!.errorCode ?? "unknown"}
                    </span>
                    <p className="text-xs text-night-400 mt-1">
                      {new Date(p!.updatedAt).toLocaleString("en-AU", {
                        timeZone: "Australia/Adelaide",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-xs text-night-400">
                      retries: {p!.retryCount}
                    </p>
                  </div>
                </div>

                <p className="text-sm font-medium text-night-700 mb-2">
                  User saw: &ldquo;{p!.errorMessage ?? "—"}&rdquo;
                </p>

                {p!.rawError ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-night-400 hover:text-night-600">
                      Raw error
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-night-50 p-3 text-xs text-night-700 whitespace-pre-wrap break-all">
                      {p!.rawError}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
