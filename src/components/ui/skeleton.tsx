import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-skeleton rounded-md bg-muted", className)} {...props} />
}

export { Skeleton }
