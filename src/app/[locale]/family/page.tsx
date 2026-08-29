import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Nav from "@/components/Nav";
import { db } from "@/lib/db";
import StoryPeopleManager from "../profiles/[id]/characters/StoryPeopleManager";

export default async function FamilyPage() {
  const { userId } = await auth();
  if (!userId) notFound();

  const [profiles, people] = await Promise.all([
    db.profiles.getByUserId(userId),
    db.storyPeople.getByUserId(userId),
  ]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">
            Family & Friends
          </h1>
          <p className="mt-2 max-w-2xl text-night-500">
            Add reusable people, pets, and companions. Pick who appears each
            time you create a story.
          </p>
        </div>

        <StoryPeopleManager profiles={profiles} initialPeople={people} />
      </main>
    </>
  );
}
