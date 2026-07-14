'use client'

import { useTranslations } from 'next-intl'

type Props = {
  storiesCount: number
  profilesCount: number
}

export default function DashboardGreeting({ storiesCount, profilesCount }: Props) {
  const t = useTranslations('dashboard')
  const hour = new Date().getHours()

  const { greeting, emoji } =
    hour >= 5 && hour < 12
      ? { greeting: t('greetingMorning'), emoji: '☀️' }
      : hour >= 12 && hour < 17
        ? { greeting: t('greetingAfternoon'), emoji: '🌤️' }
        : hour >= 17 && hour < 21
          ? { greeting: t('greetingEvening'), emoji: '🌙' }
          : { greeting: t('greetingNight'), emoji: '✨' }

  const subtitle =
    storiesCount === 0
      ? t('subtitleEmpty')
      : t('subtitleStories', {
          stories: storiesCount,
          storiesLabel: storiesCount === 1 ? t('story') : t('stories'),
          profiles: profilesCount,
          profilesLabel: profilesCount === 1 ? t('profile') : t('profiles'),
        })

  return (
    <div className="mb-10">
      <h1 className="font-display text-4xl font-bold text-night-800">
        {greeting} {emoji}
      </h1>
      <p className="mt-2 text-night-500">{subtitle}</p>
    </div>
  )
}
