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
        <LocationFixturesManager initialFixtures={fixtures} />
      </main>
    </>
  );
}
