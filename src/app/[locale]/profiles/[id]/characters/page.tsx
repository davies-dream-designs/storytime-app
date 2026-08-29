import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import Icon from "@/components/ui/Icon";
import { db } from "@/lib/db";
import StoryPeopleManager from "./StoryPeopleManager";

export default async function StoryPeoplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  const { id } = await params;
  const profile = await db.profiles.getById(id);
  if (!userId || !profile || profile.userId !== userId) notFound();

  const [profiles, people] = await Promise.all([
    db.profiles.getByUserId(userId),
    db.storyPeople.getByUserId(userId),
  ]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8">
          <Link
            href={`/profiles/${profile.id}` as string}
            className="inline-flex items-center gap-2 text-sm font-bold text-night-500 hover:text-night-700"
          >
            <Icon name="arrowLeft" className="h-4 w-4" />
            Back To {profile.name}
          </Link>
          <h1 className="mt-4 font-display text-4xl font-bold text-night-800">
            Family & Friends
          </h1>
          <p className="mt-2 max-w-2xl text-night-500">
            Add reusable people, pets, and companions. Pick who appears when you
            create a story for {profile.name} or another child.
          </p>
        </div>

        <StoryPeopleManager
          currentProfileId={profile.id}
          profiles={profiles}
          initialPeople={people}
        />
      </main>
    </>
  );
}
