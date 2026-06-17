import React from "react";
import styles from "./Form.module.css";

interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

export const Form: React.FC<FormProps> = ({ children, className, ...props }) => (
  <form className={`${styles.form} ${className || ""}`} {...props}>
    {children}
  </form>
);

export const FormSectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sectionTitle}>{children}</div>
);

export const FormDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className={styles.description}>{children}</p>
);

export const FormGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={`${styles.group} ${className || ""}`}>{children}</div>;

export const FormRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.row}>{children}</div>
);

export const FormLabel: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({
  children,
  ...props
}) => (
  <label className={styles.label} {...props}>
    {children}
  </label>
);

export const FormInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input className={styles.input} {...props} />
);

export const FormTextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea className={styles.textarea} {...props} />
);

export const FormHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className={styles.hint}>{children}</span>
);

export const FormAlert: React.FC<{ type: "success" | "error"; children: React.ReactNode }> = ({
  type,
  children,
}) => (
  <div className={type === "success" ? styles.successAlert : styles.errorAlert}>
    {children}
  </div>
);
