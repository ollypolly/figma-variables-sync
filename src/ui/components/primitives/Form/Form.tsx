import React from "react";
import * as RadixForm from "@radix-ui/react-form";
import styles from "./Form.module.css";

export const Form = React.forwardRef<HTMLFormElement, RadixForm.FormProps>(
  ({ className, ...props }, ref) => (
    <RadixForm.Root
      ref={ref}
      className={`${styles.form} ${className || ""}`}
      {...props}
    />
  )
);
Form.displayName = "Form";
