import Nav from "@/components/Nav";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Storycot",
};

const EFFECTIVE = "26 July 2026";
const CONTACT = "hello@storycot.com";
const COMPANY = "Davies Dream Designs";
const ABN = ""; // Add ABN when registered

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold text-night-800 mb-3">{title}</h2>
      <div className="text-night-700 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-display text-3xl font-bold text-night-800">Terms of Service</h1>
        <p className="mt-2 text-sm text-night-400">Effective {EFFECTIVE}</p>

        <p className="mt-6 text-sm text-night-600 leading-relaxed">
          Welcome to Storycot, operated by {COMPANY} (ABN {ABN || "pending"}){" "}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an account
          or using Storycot you agree to these terms. If you don&apos;t agree, please don&apos;t
          use the service.
        </p>

        <Section title="1. What Storycot is">
          <p>
            Storycot is an AI-powered platform that lets you create personalised bedtime stories
            and illustrated books for children. You provide details about a child, choose a theme,
            and our service generates a unique story. You can also order professionally printed
            hardcover books.
          </p>
        </Section>

        <Section title="2. Accounts">
          <p>
            You must be 18 or older to create an account. You&apos;re responsible for keeping your
            login credentials secure. We use Clerk for authentication — their terms apply to your
            login credentials.
          </p>
          <p>
            You&apos;re responsible for all activity that happens under your account. Let us know
            immediately at {CONTACT} if you suspect unauthorised access.
          </p>
        </Section>

        <Section title="3. Credits and payment">
          <p>
            Storycot uses a credit system. New accounts receive 3 free credits. Generating a plain
            text story costs 1 credit; generating an illustrated book costs 8 credits.
          </p>
          <p>
            Credit packs are purchased through Stripe. Prices are in Australian dollars (AUD) and
            are inclusive of GST where applicable. Credits are non-refundable once used, except
            where stated below.
          </p>
          <p>
            If an illustrated book build fails completely after exhausting retries, any credits
            spent on that build are automatically refunded to your account.
          </p>
          <p>
            <strong>Printed books are currently available to Australian addresses only.</strong>{" "}
            If a non-Australian billing address is detected at checkout, your payment will be
            automatically refunded and your book won&apos;t be printed.
          </p>
          <p>
            Hardcover print orders are fulfilled by Lulu. Lulu&apos;s terms apply to the
            manufacture and delivery of physical books. Once an order is submitted to Lulu we
            cannot cancel it — please double-check your shipping address before ordering.
          </p>
        </Section>

        <Section title="4. Content you create">
          <p>
            You own the stories and books you create on Storycot. You grant us a limited licence
            to store and process your content in order to provide the service (for example, to
            generate images, produce PDFs, and fulfil print orders).
          </p>
          <p>
            You must not use Storycot to generate content that is harmful, illegal, or infringes
            anyone&apos;s rights. Our AI has content-safety filters and we may block or remove
            content that violates these terms without notice.
          </p>
          <p>
            Generated stories and images are produced by AI and may not be legally copyrightable
            in all jurisdictions. You use them at your own discretion.
          </p>
        </Section>

        <Section title="5. Children's content">
          <p>
            Storycot is designed for use by parents, grandparents, and carers to create content
            for children. Accounts must be created by adults. Children&apos;s names, ages, and
            interests you provide are used solely to personalise stories — see our{" "}
            <Link href="/privacy" className="text-blush-600 hover:underline">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
          <p>
            By entering a child&apos;s information you confirm you have parental or guardian
            authority to do so.
          </p>
        </Section>

        <Section title="6. Intellectual property">
          <p>
            Our platform, brand, and code are owned by {COMPANY}. The Storycot name and logo
            may not be used without our permission.
          </p>
          <p>
            We have guardrails to prevent stories from reproducing protected franchise characters
            or trademarks. If a story is flagged, it won&apos;t be eligible for print fulfilment.
          </p>
        </Section>

        <Section title="7. Service availability">
          <p>
            We aim for high availability but don&apos;t guarantee uninterrupted service. AI
            generation depends on third-party providers (Anthropic, OpenAI) and may occasionally
            be unavailable or slow. Credits are not consumed if a story or illustration fails to
            generate.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the extent permitted by Australian law, our liability for any claim arising from
            your use of Storycot is limited to the amount you paid us in the 3 months before the
            claim arose. We are not liable for indirect or consequential loss.
          </p>
          <p>
            Nothing in these terms excludes any right you may have under the Australian Consumer
            Law that cannot legally be excluded.
          </p>
        </Section>

        <Section title="9. Changes to these terms">
          <p>
            We may update these terms from time to time. We&apos;ll post the new version here with
            an updated effective date. Continued use of Storycot after changes means you accept
            the updated terms.
          </p>
        </Section>

        <Section title="10. Governing law">
          <p>
            These terms are governed by the laws of South Australia, Australia. Any disputes will
            be resolved in the courts of South Australia.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms? Email us at{" "}
            <a href={`mailto:${CONTACT}`} className="text-blush-600 hover:underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </main>
    </>
  );
}
