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
        <StoryPeopleManager profiles={profiles} initialPeople={people} />
      </main>
    </>
  );
}
