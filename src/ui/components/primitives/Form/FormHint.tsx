import React from "react";
import { Text } from "../Text/Text";
import styles from "./FormHint.module.css";

export interface FormHintProps {
  children: React.ReactNode;
}

export const FormHint: React.FC<FormHintProps> = ({ children }) => (
  <Text
    as="span"
    color="secondary"
    className={styles.hint}
  >
    {children}
  </Text>
);
