import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-gold/30 bg-gold/20 text-gold",
        board: "border-board/40 bg-board/20 text-blue-200",
        success: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300",
        danger: "border-red-500/30 bg-red-500/20 text-red-300",
        muted: "border-white/10 bg-white/5 text-white/60",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
