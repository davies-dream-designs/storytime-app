type PublicStoryModerationEvent = {
  id: string;
  storyId: string;
  actorLabel: string;
  action: string;
  note: string | null;
  createdAt: string;
};

export default function PublicStoryModerationEventsSection({
  events,
}: {
  events: PublicStoryModerationEvent[];
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 font-display text-xl font-bold text-night-800">
        Public moderation audit
      </h2>
      <p className="mb-3 text-sm text-night-400">
        Recent public gallery moderation actions, newest first.
      </p>
      {events.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-6 text-center text-night-400">
          No public moderation events yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm">
          {events.map((event) => (
            <div
              key={event.id}
              className="grid gap-2 border-b border-night-100 p-4 last:border-b-0 sm:grid-cols-[160px_1fr_auto]"
            >
              <div>
                <p className="text-sm font-bold text-night-800">
                  {event.action}
                </p>
                <p className="mt-1 text-xs text-night-400">
                  {event.actorLabel}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs text-night-400">
                  story: {event.storyId}
                </p>
                {event.note ? (
                  <p className="mt-1 text-sm leading-6 text-night-700">
                    {event.note}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-night-400">
                {new Date(event.createdAt).toLocaleString("en-AU", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
