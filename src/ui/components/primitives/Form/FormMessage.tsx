import React from "react";
import * as RadixForm from "@radix-ui/react-form";
import styles from "./FormMessage.module.css";

export const FormMessage = React.forwardRef<HTMLDivElement, RadixForm.FormMessageProps>(
  ({ className, ...props }, ref) => (
    <RadixForm.Message
      ref={ref}
      className={`${styles.message} ${className || ""}`}
      {...props}
    />
  )
);
FormMessage.displayName = "FormMessage";
