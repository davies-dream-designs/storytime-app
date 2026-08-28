import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Nav from "@/components/Nav";
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
        <div className="mb-8">
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

        <LocationFixturesManager initialFixtures={fixtures} />
      </main>
    </>
  );
}
