import Nav from "@/components/Nav";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Storycot",
};

const EFFECTIVE = "26 July 2026";
const CONTACT = "hello@storycot.com";
const COMPANY = "Davies Dream Designs";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold text-night-800 mb-3">
        {title}
      </h2>
      <div className="text-night-700 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-display text-3xl font-bold text-night-800">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-night-400">Effective {EFFECTIVE}</p>

        <p className="mt-6 text-sm text-night-600 leading-relaxed">
          {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates Storycot at
          storycot.com. This policy explains what personal information we
          collect, why we collect it, and how we handle it. We comply with the
          Australian Privacy Act 1988 (Cth).
        </p>

        <Section title="1. What information we collect">
          <p>
            <strong>Account information:</strong> Your email address and name,
            collected when you sign up via email or Google (handled by Clerk —
            see their privacy policy).
          </p>
          <p>
            <strong>Child profile information:</strong> Names, ages or dates of
            birth, interests, favourite activities, and physical appearance
            descriptions that you voluntarily enter to personalise stories. This
            information relates to children but is provided by the adult account
            holder.
          </p>
          <p>
            <strong>Story and book content:</strong> The stories and illustrated
            books we generate for you, stored so you can access them later.
          </p>
          <p>
            <strong>Payment information:</strong> Payment is processed by
            Stripe. We do not store your card details. We do store the outcome
            of transactions (amount, date, order status) and shipping addresses
            for print orders.
          </p>
          <p>
            <strong>Usage data:</strong> Pages visited, features used, and
            performance metrics, collected via Vercel Analytics. This data is
            aggregated and does not identify you individually.
          </p>
        </Section>

        <Section title="2. How we use your information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To generate personalised stories and illustrated books</li>
            <li>To process payments and fulfil print orders</li>
            <li>
              To send transactional emails (order confirmation, shipping
              notification)
            </li>
            <li>To improve the service and diagnose technical issues</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p>
            We do not sell your personal information. We do not use child
            profile information for any purpose other than generating your
            personalised content.
          </p>
        </Section>

        <Section title="3. Children's information">
          <p>
            Storycot is a service for adults to create content for children — it
            is not directed at children themselves. We collect children&apos;s
            names, ages, and interests only because you provide them to
            personalise stories. This information is:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Not shared with third parties for any purpose other than
              generating your story
            </li>
            <li>Not used for advertising or profiling</li>
            <li>
              Deleted when you delete the child&apos;s profile from your account
            </li>
          </ul>
          <p>
            If you believe a child has created an account directly, please
            contact us at{" "}
            <a
              href={`mailto:${CONTACT}`}
              className="text-blush-600 hover:underline"
            >
              {CONTACT}
            </a>{" "}
            and we will delete the account.
          </p>
        </Section>

        <Section title="4. Who we share information with">
          <p>We use the following third-party services to operate Storycot:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Clerk</strong> — authentication and account management
            </li>
            <li>
              <strong>Anthropic</strong> — AI story generation (story text and
              themes are sent to generate content; child names and personal
              details are included in the prompt)
            </li>
            <li>
              <strong>OpenAI</strong> — AI illustration generation (story scene
              descriptions are sent to generate images)
            </li>
            <li>
              <strong>ElevenLabs</strong> — voice narration generation
            </li>
            <li>
              <strong>Stripe</strong> — payment processing
            </li>
            <li>
              <strong>Lulu</strong> — print fulfillment (name and shipping
              address shared for print orders)
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery
            </li>
            <li>
              <strong>Vercel</strong> — hosting, storage, and anonymised
              analytics
            </li>
            <li>
              <strong>Neon</strong> — database hosting (your data is stored in
              Neon&apos;s Postgres infrastructure)
            </li>
          </ul>
          <p>
            Each of these providers has their own privacy policy. We only share
            the minimum information needed to provide the service.
          </p>
        </Section>

        <Section title="5. Data storage and security">
          <p>
            Your data is stored on servers located in the United States (Vercel,
            Neon, Vercel Blob). By using Storycot, you consent to this
            international transfer. We use encryption in transit (HTTPS) and
            access controls to protect your data.
          </p>
          <p>
            Illustrated book files (PDFs, images) may be archived or deleted
            after a period of inactivity to manage storage. We will not delete
            files without reasonable notice.
          </p>
        </Section>

        <Section title="6. Your rights">
          <p>
            Under the Australian Privacy Act you have the right to access,
            correct, or request deletion of your personal information. You can:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Delete child profiles and their associated stories from your
              account at any time
            </li>
            <li>Request a copy of your personal data by emailing {CONTACT}</li>
            <li>
              Request deletion of your account and all associated data by
              emailing {CONTACT}
            </li>
          </ul>
        </Section>

        <Section title="7. Cookies">
          <p>
            Storycot uses cookies and local storage for authentication (Clerk)
            and to remember your session. Vercel Analytics uses anonymised
            identifiers — no advertising cookies are used.
          </p>
        </Section>

        <Section title="8. Changes to this policy">
          <p>
            We may update this policy from time to time. We&apos;ll post the new
            version here with an updated effective date. For material changes
            we&apos;ll send an email to your registered address.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Privacy questions or requests:{" "}
            <a
              href={`mailto:${CONTACT}`}
              className="text-blush-600 hover:underline"
            >
              {CONTACT}
            </a>
          </p>
          <p>
            See also our{" "}
            <Link href="/terms" className="text-blush-600 hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </Section>
      </main>
    </>
  );
}
