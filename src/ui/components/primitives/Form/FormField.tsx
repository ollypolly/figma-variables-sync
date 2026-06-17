import React from "react";
import * as RadixForm from "@radix-ui/react-form";
import styles from "./FormField.module.css";

export interface FormFieldProps extends RadixForm.FormFieldProps {
  grow?: boolean;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, grow, style, ...props }, ref) => {
    const customStyle: React.CSSProperties = {
      flexGrow: grow ? 1 : undefined,
      ...style,
    };
    return (
      <RadixForm.Field
        ref={ref}
        className={`${styles.field} ${className || ""}`}
        style={customStyle}
        {...props}
      />
    );
  }
);
FormField.displayName = "FormField";
