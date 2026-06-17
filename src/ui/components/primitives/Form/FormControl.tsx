import React from "react";
import * as RadixForm from "@radix-ui/react-form";
import styles from "./FormControl.module.css";

export interface FormControlProps extends RadixForm.FormControlProps {
  as?: "input" | "textarea";
  type?: string;
  placeholder?: string;
  required?: boolean;
}

export const FormControl = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  FormControlProps
>(({ as = "input", className, ...props }, ref) => {
  const isTextarea = as === "textarea";
  const controlClass = isTextarea ? styles.textarea : styles.input;

  return (
    <RadixForm.Control asChild {...props}>
      {isTextarea ? (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          className={`${controlClass} ${className || ""}`}
        />
      ) : (
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          className={`${controlClass} ${className || ""}`}
        />
      )}
    </RadixForm.Control>
  );
});
FormControl.displayName = "FormControl";
