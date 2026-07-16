"use client";

import type { ButtonHTMLAttributes } from "react";
import { buttonClassName } from "@/components/ui/buttonStyles";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "default" | "compact" | "large";
  fullWidth?: boolean;
};

export default function Button({
  variant,
  size,
  fullWidth,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
    />
  );
}
