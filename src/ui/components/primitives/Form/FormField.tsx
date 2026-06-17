import React from "react";
import * as RadixForm from "@radix-ui/react-form";
import styles from "./FormField.module.css";

export const FormField = React.forwardRef<HTMLDivElement, RadixForm.FormFieldProps>(
  ({ className, ...props }, ref) => (
    <RadixForm.Field
      ref={ref}
      className={`${styles.field} ${className || ""}`}
      {...props}
    />
  )
);
FormField.displayName = "FormField";
