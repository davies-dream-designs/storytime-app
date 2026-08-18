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
  const troubleshooting: FAQItem[] = [
    {
      q: `My book is stuck or shows "The illustrated book did not finish" — what do I do?`,
      a: `Tap the "Retry" button on the book page to try again. If individual illustrations failed, each one shows a "Retry" button next to it — retrying a failed illustration is always free. If the whole book is stuck, the Retry button at the bottom of the page will resume it without charging you again.`,
    },
    {
      q: `One or more illustrations say "Generation failed" — what does that mean?`,
      a: `The AI illustration service occasionally hits a temporary error. Tap the "Retry" button next to any failed illustration to generate it again. Retrying a failed illustration is free — you only pay credits for new redos once the image has successfully generated.`,
    },
    {
      q: "I see a technical error message instead of an illustration — is that normal?",
      a: "That shouldn't happen. We've improved how errors are shown, so you should now see a friendly message instead of technical details. Tap Retry to try again, and if the problem keeps coming back, email us at hello@storycot.com.au.",
    },
    {
      q: `Why does the book say "0 of X illustrations complete" when I can see it's trying?`,
      a: "Illustrations are generated in parallel — they'll all appear at roughly the same time once they're done. A typical illustrated book takes around 2–4 minutes depending on the number of pages. If it seems stuck for more than 10 minutes, tap Retry.",
    },
    {
      q: "My illustration was flagged by the safety system — what happened?",
      a: "Our AI provider automatically checks generated images for content safety. If a particular page scene is flagged, Storycot will try again automatically with a simplified prompt. If it's still blocked, you'll see a Retry button — tapping it is free and will attempt a different approach.",
    },
    {
      q: "Can I change a finished illustration I don't like?",
      a: `Yes! Tap the "Redo" button on any completed illustration. You can type in what you'd like changed (e.g. "make the cape blue", "show both boots") and we'll generate a new version. Redoing a finished illustration costs 1 credit.`,
    },
  ];

  const gettingStarted: FAQItem[] = [
    {
      q: "How do credits work?",
      a: "Every new account gets free credits to get started. Text stories cost 1 credit each. Adding illustrations costs credits based on the story length — it varies by age band. You can buy more credit packs any time from your account page.",
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
    {
      q: "Can I change the language?",
      a: "Yes — use the language selector in the navigation bar to switch between supported languages.",
    },
    {
      q: "Can I share my story with someone?",
      a: "Yes — tap the share button on the story page to get a link. Anyone with the link can read the story without needing an account.",
    },
  ];

  const illustratedBooks: FAQItem[] = [
    {
      q: "What is an illustrated book?",
      a: "An illustrated book is a story with AI-generated artwork on every page. The illustrations are created to match the characters and scenes in your child's story, making it feel like a real picture book.",
    },
    {
      q: "How much does an illustrated book cost?",
      a: "The credit cost depends on the story's length and age band. The cost is shown on the book page before you start. You can buy more credits from your account page.",
    },
    {
      q: "How long does it take to illustrate a book?",
      a: "Typically 2–4 minutes. Storycot generates all the illustrations in parallel, so the whole book arrives at once rather than page by page.",
    },
    {
      q: "Can I download my illustrated book?",
      a: "Yes - once illustrations are ready, you can unlock a digital download for $9.95 AUD. The download includes an illustrated PDF, an EPUB, all the illustration images, and voice narration. Downloads are available for 180 days after your book is ready.",
    },
    {
      q: "What's included in the digital download?",
      a: "The digital download ($9.95 AUD) includes: an illustrated PDF, an EPUB e-reader file, all the illustration images as a ZIP, and AI voice narration of the story.",
    },
    {
      q: "What happens if the illustrations fail to generate?",
      a: "Storycot will automatically retry failed illustrations. If a book fails completely after retrying, your credits are refunded to your account. You won't lose anything. You can also manually retry individual failed illustrations for free from the book review page.",
    },
  ];

  const voiceNarration: FAQItem[] = [
    {
      q: "What is voice narration?",
      a: "Voice narration lets you play your story out loud, like an audiobook. It's a lovely way to do bedtime stories when you want Storycot to do the reading.",
    },
    {
      q: "How do I unlock voice narration?",
      a: "Voice narration is available after you unlock the digital download for your book. The digital download is a one-off purchase of $9.99 AUD per book.",
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

        <FAQSection title="Troubleshooting" items={troubleshooting} />
        <FAQSection title="Getting started" items={gettingStarted} />
        <FAQSection title="Illustrated books" items={illustratedBooks} />
        <FAQSection title="Voice narration" items={voiceNarration} />
        <FAQSection title="Hardcover books" items={hardcoverBooks} />
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
