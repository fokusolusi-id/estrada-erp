import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";

const badgeVariants = cva(
  "inline-flex items-center justify-center border border-transparent font-medium focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:-ms-px [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        success: "bg-success text-white",
        warning: "bg-[var(--color-warning-accent,var(--color-yellow-500))] text-white",
        info: "bg-[var(--color-info-accent,var(--color-violet-500))] text-white",
        outline: "bg-transparent border border-border text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
      },
      appearance: {
        default: "",
        light: "",
        outline: "",
        ghost: "border-transparent bg-transparent",
      },
      disabled: { true: "opacity-50 pointer-events-none" },
      size: {
        lg: "rounded-md px-[0.5rem] h-7 min-w-7 gap-1.5 text-xs [&_svg]:size-3.5",
        md: "rounded-md px-[0.45rem] h-6 min-w-6 gap-1.5 text-xs [&_svg]:size-3.5 ",
        sm: "rounded-sm px-[0.325rem] h-5 min-w-5 gap-1 text-[0.6875rem] leading-[0.75rem] [&_svg]:size-3",
        xs: "rounded-sm px-[0.25rem] h-4 min-w-4 gap-1 text-[0.625rem] leading-[0.5rem] [&_svg]:size-3",
      },
      shape: { default: "", circle: "rounded-full" },
    },
    compoundVariants: [
      { variant: "success", appearance: "light", className: "bg-success/10 text-success" },
      { variant: "destructive", appearance: "light", className: "bg-destructive/10 text-destructive" },
      { variant: "secondary", appearance: "light", className: "bg-secondary text-secondary-foreground" },
      { variant: "primary", appearance: "light", className: "bg-primary/10 text-primary" },
    ],
    defaultVariants: { variant: "primary", appearance: "default", size: "md" },
  },
);

function Badge({
  className,
  variant,
  size,
  appearance,
  shape,
  asChild = false,
  disabled,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? SlotPrimitive.Slot : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant, size, appearance, shape, disabled }), className)} {...props} />;
}

export { Badge, badgeVariants };
