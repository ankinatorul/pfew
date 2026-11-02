import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const styles = cva("button", {
  variants: {
    variant: { default: "primary", secondary: "secondary", danger: "danger" },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  asChild,
  variant,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof styles> & { asChild?: boolean }) {
  const C = asChild ? Slot : "button";
  return (
    <C className={twMerge(clsx(styles({ variant }), className))} {...props} />
  );
}
