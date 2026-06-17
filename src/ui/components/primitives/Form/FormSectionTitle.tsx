import React from "react";
import { Text } from "../Text/Text";
import styles from "./FormSectionTitle.module.css";

export interface FormSectionTitleProps {
  children: React.ReactNode;
}

export const FormSectionTitle: React.FC<FormSectionTitleProps> = ({ children }) => (
  <Text
    as="h3"
    size="13"
    weight="semibold"
    className={styles.sectionTitle}
  >
    {children}
  </Text>
);
