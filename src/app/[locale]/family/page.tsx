import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Nav from "@/components/Nav";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { Link } from "@/i18n/navigation";
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
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">
              Family & Friends
            </h1>
            <p className="mt-2 max-w-2xl text-night-500">
              Manage reusable people, pets, and original companions at the
              account level. Pick who appears each time you create a story.
            </p>
          </div>
          <Link
            href="/stories/new"
            className={buttonClassName({ size: "compact" })}
          >
            <Icon name="sparkle" />
            New Story
          </Link>
        </div>

        <StoryPeopleManager profiles={profiles} initialPeople={people} />
      </main>
    </>
  );
}
