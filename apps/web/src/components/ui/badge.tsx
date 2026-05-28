import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/12 text-primary",
        red: "border-red-400/30 bg-red-500/10 text-red-200",
        amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
        blue: "border-sky-400/30 bg-sky-500/10 text-sky-200",
        neutral: "border-white/10 bg-white/8 text-muted-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}
