export function isMaintenanceMode(): boolean {
  // @ts-expect-error: TS4111 prevents dot notation, but Next.js requires it for build-time inline replacement
  return process.env.NEXT_PUBLIC_APP_MODE === "maintenance"
}
