import React from "react";
import styles from "./Text.module.css";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  size?: "11" | "12" | "13" | "14" | "16";
  weight?: "normal" | "medium" | "semibold" | "bold";
  color?: "primary" | "secondary" | "brand" | "error" | "success";
  as?: "span" | "p" | "div" | "label" | "h1" | "h2" | "h3";
  children?: React.ReactNode;
}

export const Text: React.FC<TextProps> = ({
  size = "11",
  weight = "normal",
  color = "primary",
  as: Component = "span",
  className,
  children,
  ...props
}) => {
  const classes = [
    styles.text,
    styles[`size-${size}`],
    styles[`weight-${weight}`],
    styles[`color-${color}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
};
