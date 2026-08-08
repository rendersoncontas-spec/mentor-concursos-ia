export const MentorThresholds = {
  burnout: {
    lowEnergy: 2.5,
    lowFocus: 2.8,
    weeklyHours: 40,
    reviewBacklog: 100,
  },

  performance: {
    criticalAccuracy: 60, // Menos de 60% é risco de reprovação
    warningAccuracy: 75,
  },

  consistency: {
    minimumStreak: 5,
    idealStreak: 30,
  },

  reviews: {
    overdueWarning: 20,
    overdueCritical: 50,
  },
}
