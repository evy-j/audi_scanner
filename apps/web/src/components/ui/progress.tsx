import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({
  value = 0,
  className,
  indicatorClassName
}: {
  value?: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const width = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-white/8", className)}>
      <div
        className={cn("h-full rounded-full bg-primary shadow-glow transition-all duration-500", indicatorClassName)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
