import type { Insight, IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"

export interface CapabilityMetadata {
  id: string
  name: string
  version: string
  enabled: boolean
  priority: number // Peso base
  dependencies: string[]
}

export interface MentorCapability {
  metadata: CapabilityMetadata
  execute(context: IntelligenceContext): Insight[]
}
