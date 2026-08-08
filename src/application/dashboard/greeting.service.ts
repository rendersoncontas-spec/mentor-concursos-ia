export interface Greeting {
  greeting: string
  emoji?: string
  period: "morning" | "afternoon" | "evening"
}

export function getGreeting(date: Date = new Date()): Greeting {
  const hours = date.getHours()

  if (hours >= 5 && hours < 12) {
    return {
      greeting: "Bom dia",
      emoji: "🌅",
      period: "morning",
    }
  }

  if (hours >= 12 && hours < 18) {
    return {
      greeting: "Boa tarde",
      emoji: "☀️",
      period: "afternoon",
    }
  }

  return {
    greeting: "Boa noite",
    emoji: "🌙",
    period: "evening",
  }
}

export function getFormattedDate(date: Date = new Date()): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}
