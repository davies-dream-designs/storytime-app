import { Link } from "@/i18n/navigation";

type ErrorStateAction = {
  href: "/" | "/dashboard" | "/stories" | "/books";
  label: string;
  variant?: "primary" | "secondary";
};

type ErrorStateProps = {
  eyebrow: string;
  title: string;
  body: string;
  actions: ErrorStateAction[];
  secondaryAction?: React.ReactNode;
};

export default function ErrorState({
  eyebrow,
  title,
  body,
  actions,
  secondaryAction,
}: ErrorStateProps) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
      <div className="relative mb-8 h-36 w-36" aria-hidden="true">
        <div className="absolute inset-x-5 bottom-2 h-8 rounded-full bg-night-200/50 blur-md" />
        <div className="animate-drift absolute inset-0 rounded-[2rem] border-4 border-night-200 bg-white shadow-lg shadow-night-200/40">
          <div className="absolute left-5 top-5 h-20 w-24 rotate-[-8deg] rounded-xl border-2 border-night-200 bg-parchment shadow-sm">
            <div className="mx-auto mt-4 h-2 w-14 rounded-full bg-star-200" />
            <div className="mx-auto mt-3 h-2 w-10 rounded-full bg-night-100" />
            <div className="mx-auto mt-3 h-2 w-12 rounded-full bg-night-100" />
          </div>
          <div className="absolute bottom-5 right-4 flex h-16 w-16 items-center justify-center rounded-full bg-moon-200 font-display text-3xl text-night-800 shadow-md">
            ?
          </div>
          <span className="absolute right-7 top-4 text-2xl">✨</span>
          <span className="absolute bottom-8 left-6 text-xl">🌙</span>
        </div>
      </div>

      <p className="text-sm font-bold uppercase tracking-wide text-star-600">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold text-night-800 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-night-500">{body}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`storycot-btn ${
              action.variant === "secondary"
                ? "storycot-btn-secondary"
                : "storycot-btn-primary"
            }`}
          >
            {action.label}
          </Link>
        ))}
        {secondaryAction}
      </div>
    </main>
  );
}
