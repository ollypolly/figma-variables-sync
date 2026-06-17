import { ComponentProps } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: "primary" | "secondary";
}

export const Button = ({ variant = "secondary", className, ...props }: ButtonProps) => {
  const variantClass = variant === "primary" ? styles.primary : styles.secondary;
  return (
    <button
      {...props}
      className={`${styles.button} ${variantClass} ${className || ""}`}
    />
  );
};

export const ButtonGroup = ({ children, className, ...props }: ComponentProps<"div">) => {
  return (
    <div {...props} className={`${styles.buttonGroup} ${className || ""}`}>
      {children}
    </div>
  );
};
