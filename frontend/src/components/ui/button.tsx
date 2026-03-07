import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        gold: "bg-gold text-navy font-bold rounded-lg hover:bg-gold-hover focus-visible:ring-gold shadow-[0_4px_14px_rgba(245,197,24,0.4)] hover:shadow-[0_6px_20px_rgba(245,197,24,0.6)] active:scale-95",
        board:
          "bg-board text-gold font-bold rounded-lg hover:bg-board-hover focus-visible:ring-board border border-gold/20 hover:border-gold/50 active:scale-95",
        outline:
          "border border-gold/40 text-gold bg-transparent rounded-lg hover:bg-gold/10 hover:border-gold focus-visible:ring-gold active:scale-95",
        ghost:
          "text-white/70 hover:text-white hover:bg-white/10 rounded-lg active:scale-95",
        danger:
          "bg-red-700 text-white rounded-lg hover:bg-red-600 focus-visible:ring-red-500 active:scale-95",
        success:
          "bg-emerald-700 text-white rounded-lg hover:bg-emerald-600 focus-visible:ring-emerald-500 active:scale-95",
        link: "text-gold underline-offset-4 hover:underline p-0",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        xl: "h-14 px-7 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "gold",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
