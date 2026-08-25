import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Nav from "@/components/Nav";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import LocationFixturesManager from "./LocationFixturesManager";

export default async function LocationsPage() {
  const { userId } = await auth();
  if (!userId) notFound();

  const fixtures = await db.locationFixtures.getByUserId(userId);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">
              Locations
            </h1>
            <p className="mt-2 max-w-2xl text-night-500">
              Save real places you use often — a bedroom, Grandma&apos;s house,
              the car — with notes and a reference photo. We&apos;ll suggest them
              when a matching place turns up in a new book so the illustrations
              stay consistent.
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

        <LocationFixturesManager initialFixtures={fixtures} />
      </main>
    </>
  );
}
