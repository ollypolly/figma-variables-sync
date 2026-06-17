import React from "react";
import { Text } from "../Text/Text";
import styles from "./FormDescription.module.css";

export interface FormDescriptionProps {
  children: React.ReactNode;
}

export const FormDescription: React.FC<FormDescriptionProps> = ({ children }) => (
  <Text
    as="p"
    size="11"
    color="secondary"
    className={styles.description}
  >
    {children}
  </Text>
);
