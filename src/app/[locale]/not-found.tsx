import { getTranslations } from "next-intl/server";
import Nav from "@/components/Nav";
import ErrorState from "@/components/ErrorState";

export default async function LocaleNotFound() {
  const t = await getTranslations("errors");

  return (
    <>
      <Nav />
      <ErrorState
        eyebrow={t("notFoundEyebrow")}
        title={t("notFoundTitle")}
        body={t("notFoundBody")}
        actions={[
          { href: "/stories", label: t("storiesButton") },
          { href: "/books", label: t("booksButton"), variant: "secondary" },
        ]}
      />
    </>
  );
}
