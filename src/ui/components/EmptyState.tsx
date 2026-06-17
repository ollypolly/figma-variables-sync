import React from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  description: string | React.ReactNode;
  icon?: string;
  type?: "default" | "success";
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = "ℹ",
  type = "default",
}) => {
  const iconClass = type === "success" ? `${styles.icon} ${styles.successIcon}` : styles.icon;
  return (
    <div className={styles.container}>
      <div className={iconClass}>{icon}</div>
      <div className={styles.title}>{title}</div>
      <p className={styles.desc}>{description}</p>
    </div>
  );
};
