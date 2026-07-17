type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "default" | "compact" | "large";

type ButtonClassNameOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "storycot-btn-primary",
  secondary: "storycot-btn-secondary",
  danger: "storycot-btn-danger",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "",
  compact: "storycot-btn-compact",
  large: "min-h-12 px-6 py-3.5 text-base sm:text-lg",
};

export function joinClasses(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

export function buttonClassName({
  variant = "primary",
  size = "default",
  fullWidth = false,
  className,
}: ButtonClassNameOptions = {}) {
  return joinClasses(
    "storycot-btn",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    className
  );
}
