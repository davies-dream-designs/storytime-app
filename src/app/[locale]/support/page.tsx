import Nav from "@/components/Nav";

export const metadata = {
  title: "Help & FAQ - Storycot",
};

interface FAQItem {
  q: string;
  a: string;
}

function FAQSection({ title, items }: { title: string; items: FAQItem[] }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl font-bold text-night-800 mb-6">
        {title}
      </h2>
      <div className="flex flex-col gap-4">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-2xl border border-night-100 bg-white px-6 py-5 shadow-sm"
          >
            <p className="font-bold text-night-800">{item.q}</p>
            <p className="mt-2 text-night-500 leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SupportPage() {
  const gettingStarted: FAQItem[] = [
    {
      q: "How do credits work?",
      a: "Every new account gets 3 free credits to get started. Each text story costs 1 credit, and generating illustrations costs from 8 credits depending on your child's age. You can buy more credit packs any time from your account page.",
    },
    {
      q: "How do I generate a story?",
      a: 'Create a child profile first - add their name, age, interests, and anything else that makes them unique. Then hit "New Story", pick a theme, and Storycot will write a personalised bedtime story just for them.',
    },
    {
      q: "Can I create profiles for more than one child?",
      a: "Yep! You can add as many child profiles as you like. Each story is tied to a specific profile, so every kid gets stories that feel made just for them.",
    },
    {
      q: "Do I need an account to use Storycot?",
      a: "Yes - you'll need to sign up so your stories and profiles are saved and ready whenever you need them.",
    },
  ];

  const illustratedBooks: FAQItem[] = [
    {
      q: "What is an illustrated book?",
      a: "An illustrated book is a story with AI-generated artwork on every page. The illustrations are created to match the characters and scenes in your child's story, making it feel like a real picture book.",
    },
    {
      q: "How much does an illustrated book cost?",
      a: "Generating illustrations costs from 8 credits, depending on your child's age — 8 for ages 0–2, 9 for ages 3–5, and 11 for ages 6–8. Once illustrations are ready, you can unlock your digital download (PDF, EPUB, and illustrations) for a separate one-off payment of $9.95 AUD.",
    },
    {
      q: "Can I download my illustrated book?",
      a: "Yes - once illustrations are ready, you can download your book as a PDF or EPUB from the book page. Downloads are available for 180 days after your book is ready.",
    },
    {
      q: "What happens if the illustrations fail to generate?",
      a: "No worries - Storycot will automatically retry. If it fails completely after retrying, your credits are refunded to your account. You won't lose anything.",
    },
  ];

  const voiceNarration: FAQItem[] = [
    {
      q: "What is voice narration?",
      a: "Voice narration lets you play your story out loud, like an audiobook. It's a lovely way to do bedtime stories when you want Storycot to do the reading.",
    },
    {
      q: "How do I unlock voice narration?",
      a: "Voice narration is available after you unlock the digital download for your book. The digital download is a one-off purchase of $9.95 AUD per book.",
    },
    {
      q: "Does voice narration cost extra credits?",
      a: "No - it's part of the digital download unlock. Once you've paid for the download, narration is included at no extra cost.",
    },
  ];

  const hardcoverBooks: FAQItem[] = [
    {
      q: "Can I order a real printed book?",
      a: "Yes! Once you have an illustrated book, you can order a hardcover print. The base price is $39.95 AUD and may vary slightly depending on the number of pages. Printed books are available to Australian addresses only at this time.",
    },
    {
      q: "Who prints and ships the books?",
      a: "Storycot partners with Lulu, a professional print-on-demand service, to print and ship your books. Your book is printed to order and sent directly to your door.",
    },
    {
      q: "How long does delivery take?",
      a: "Lulu handles printing and shipping, and delivery times can vary. We don't commit to a specific timeframe, but Storycot will send you an email when your order has shipped - with tracking details if they're available.",
    },
    {
      q: "Can I order multiple copies?",
      a: "Yes - you can order between 1 and 10 copies of the same book in a single order. Great for gifts.",
    },
    {
      q: "I'm not in Australia - can I still order a print book?",
      a: "Not yet. Print orders are available to Australian addresses only right now. If you place an order from outside Australia, you'll be automatically refunded. We hope to expand to more countries in the future.",
    },
    {
      q: "What if there's a problem with my print order?",
      a: "If something goes wrong with your order, our team is automatically notified and will get it sorted. You don't need to do anything - but if you want to follow up, you're always welcome to reach out at hello@storycot.com.au.",
    },
  ];

  const publicGallery: FAQItem[] = [
    {
      q: "Can I make a story public?",
      a: "Yes, public sharing is in beta for illustrated stories. Once a story has an illustrated book with a cover, you can submit it for public review. It will not appear in the public gallery until Storycot approves it.",
    },
    {
      q: "Can I share a plain text story publicly?",
      a: "Not right now. Public gallery and share links are for illustrated Storycot books, so readers see the cover art and creators have a reason to turn favourite stories into finished books.",
    },
    {
      q: "Why does public sharing need review first?",
      a: "Public illustrated stories can include child names, family details, generated images, or copyrighted ideas by mistake. Review helps keep the gallery safe, original, and suitable for families before anyone else can discover it.",
    },
    {
      q: "Can other people vote for my public story?",
      a: "Yes. Signed-in readers can vote once per story each month. Story creators cannot count votes on their own stories.",
    },
    {
      q: "Are public stories purchasable?",
      a: "Not yet. Public book purchases are planned for a later beta once moderation, legal wording, and Lulu print-on-demand handling are ready. Having an illustrated book and cover is the first eligibility step.",
    },
    {
      q: "Do public gallery winners get paid?",
      a: "No cash payouts are offered during beta. Storycot may offer small rewards such as credits, badges, discounts, or featured placement.",
    },
    {
      q: "Can a public story be reported or removed?",
      a: "Yes. Signed-in readers can report public stories. Storycot can hide, reject, or remove a public story if it includes private details, unsafe content, spam, or material the creator does not have rights to use.",
    },
    {
      q: "Can I fix a public story after review?",
      a: "Yes. You can edit the title, theme, author display name, and story page text from the story page. Saving edits removes public/share access and sends the story back to private so you can resubmit it for review.",
    },
  ];

  const billing: FAQItem[] = [
    {
      q: "How do I buy more credits?",
      a: "Head to your Account page and choose a credit pack. Payments are processed securely through Stripe. Credits are added to your account as soon as payment is confirmed.",
    },
    {
      q: "I was refunded for being outside Australia - what happened?",
      a: "Print books are only available for delivery to Australian addresses. If you checked out from another country, your order was automatically refunded. No action needed on your end.",
    },
    {
      q: "Can I get a refund on credits?",
      a: "Credits are automatically refunded if an illustration job fails completely. For other billing questions or concerns, please get in touch at hello@storycot.com.au.",
    },
  ];

  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-2xl px-5 py-14"
      >
        {/* Hero */}
        <div className="mb-2">
          <h1 className="font-display text-4xl font-bold text-night-800">
            Help &amp; FAQ
          </h1>
          <p className="mt-3 text-night-500">
            Can&apos;t find what you&apos;re looking for? Email us at{" "}
            <a
              href="mailto:hello@storycot.com.au"
              className="font-bold text-night-700 underline underline-offset-2 hover:text-night-900"
            >
              hello@storycot.com.au
            </a>
          </p>
        </div>

        <FAQSection title="Getting started" items={gettingStarted} />
        <FAQSection title="Illustrated books" items={illustratedBooks} />
        <FAQSection title="Voice narration" items={voiceNarration} />
        <FAQSection title="Hardcover books" items={hardcoverBooks} />
        <FAQSection title="Public gallery beta" items={publicGallery} />
        <FAQSection title="Billing &amp; refunds" items={billing} />

        {/* Contact card */}
        <div className="mt-14 rounded-3xl border border-night-100 bg-white px-8 py-8 shadow-sm text-center">
          <p className="font-display text-xl font-bold text-night-800">
            Still need help?
          </p>
          <p className="mt-2 text-night-500">
            Drop us a line and we&apos;ll get back to you as soon as we can.
          </p>
          <a
            href="mailto:hello@storycot.com.au"
            className="mt-5 inline-block rounded-full bg-night-800 px-7 py-3 text-sm font-bold text-white transition hover:bg-night-700"
          >
            hello@storycot.com.au
          </a>
        </div>
      </main>
    </>
  );
}
