'use client'

type Props = {
  storiesCount: number
  profilesCount: number
}

export default function DashboardGreeting({ storiesCount, profilesCount }: Props) {
  const hour = new Date().getHours()

  const { greeting, emoji } =
    hour >= 5 && hour < 12
      ? { greeting: 'Good morning', emoji: '☀️' }
      : hour >= 12 && hour < 17
        ? { greeting: 'Good afternoon', emoji: '🌤️' }
        : hour >= 17 && hour < 21
          ? { greeting: 'Good evening', emoji: '🌙' }
          : { greeting: 'Good night', emoji: '✨' }

  const subtitle =
    storiesCount === 0
      ? 'Ready to create your first magical story?'
      : `You have ${storiesCount} stor${storiesCount === 1 ? 'y' : 'ies'} across ${profilesCount} profile${profilesCount === 1 ? '' : 's'}.`

  return (
    <div className="mb-10">
      <h1 className="font-display text-4xl font-bold text-night-800">
        {greeting} {emoji}
      </h1>
      <p className="mt-2 text-night-500">{subtitle}</p>
    </div>
  )
}
