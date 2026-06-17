import React from "react";
import * as RadixForm from "@radix-ui/react-form";
import styles from "./FormLabel.module.css";

export const FormLabel = React.forwardRef<HTMLLabelElement, RadixForm.FormLabelProps>(
  ({ className, ...props }, ref) => (
    <RadixForm.Label
      ref={ref}
      className={`${styles.label} ${className || ""}`}
      {...props}
    />
  )
);
FormLabel.displayName = "FormLabel";
