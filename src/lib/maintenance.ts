export function isMaintenanceMode(): boolean {
  return process.env["NEXT_PUBLIC_APP_MODE"] === "maintenance"
}
