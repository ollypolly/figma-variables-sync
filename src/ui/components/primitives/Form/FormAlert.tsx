import React from "react";
import styles from "./FormAlert.module.css";

export interface FormAlertProps {
  type: "success" | "error";
  children: React.ReactNode;
}

export const FormAlert: React.FC<FormAlertProps> = ({ type, children }) => (
  <div className={type === "success" ? styles.successAlert : styles.errorAlert}>
    {children}
  </div>
);
