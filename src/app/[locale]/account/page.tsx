import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Nav from "@/components/Nav";
import CreditPacks from "./CreditPacks";
import ShareSection from "@/components/ShareSection";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [{ success, canceled }, t, client] = await Promise.all([
    searchParams,
    getTranslations("account"),
    clerkClient(),
  ]);
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-14">
        <h1 className="font-display text-4xl font-bold text-night-800">
          {t("title")}
        </h1>
        <p className="mt-2 text-night-500">
          {user.emailAddresses[0]?.emailAddress}
        </p>

        {success && (
          <div className="mt-6 rounded-2xl bg-green-50 border border-green-200 px-5 py-4 text-sm font-bold text-green-700">
            {t("paymentSuccess")}
          </div>
        )}
        {canceled && (
          <div className="mt-6 rounded-2xl bg-night-50 border border-night-200 px-5 py-4 text-sm text-night-500">
            {t("paymentCancelled")}
          </div>
        )}

        <div className="mt-10 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-moon-100 text-3xl">
              ✨
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-night-800">
                {isAdmin ? t("creditsUnlimited") : credits}
              </p>
              <p className="text-night-500">
                {isAdmin
                  ? t("creditsAdmin")
                  : credits === 1
                    ? t("creditSingle")
                    : t("creditsPlural")}
              </p>
            </div>
          </div>
          {!isAdmin && credits <= 1 && (
            <p className="mt-4 rounded-xl bg-star-50 px-4 py-3 text-sm font-bold text-star-700">
              {credits === 0 ? t("creditEmpty") : t("creditLow")}
            </p>
          )}
        </div>

        <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-night-800">
            {t("usageTitle")}
          </h2>
          <p className="mt-2 text-night-500">{t("usageSub")}</p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl bg-night-50 px-4 py-3">
              <p className="font-bold text-night-800">
                {t("usageTextStoryTitle")}
              </p>
              <p className="mt-1 text-sm text-night-500">
                {t("usageTextStoryBody")}
              </p>
            </div>
            <div className="rounded-2xl bg-night-50 px-4 py-3">
              <p className="font-bold text-night-800">
                {t("usageIllustratedTitle")}
              </p>
              <p className="mt-1 text-sm text-night-500">
                {t("usageIllustratedBody")}
              </p>
            </div>
            <div className="rounded-2xl bg-night-50 px-4 py-3">
              <p className="font-bold text-night-800">
                {t("usageHardcoverTitle")}
              </p>
              <p className="mt-1 text-sm text-night-500">
                {t("usageHardcoverBody")}
              </p>
            </div>
          </div>
        </section>

        {!isAdmin && <CreditPacks />}
        <ShareSection userId={userId} />
      </main>
    </>
  );
}
