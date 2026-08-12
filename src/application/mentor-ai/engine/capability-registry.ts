import type { MentorCapability } from "../capabilities/mentor.capability"

export class CapabilityRegistry {
  private static capabilities: MentorCapability[] = []

  static register(...caps: MentorCapability[]) {
    caps.forEach((cap) => {
      // Evita duplicatas pelo ID
      if (!this.capabilities.some((c) => c.metadata.id === cap.metadata.id)) {
        this.capabilities.push(cap)
      }
    })
  }

  static getActiveCapabilities(): MentorCapability[] {
    return this.capabilities.filter((cap) => cap.metadata.enabled)
  }
}
