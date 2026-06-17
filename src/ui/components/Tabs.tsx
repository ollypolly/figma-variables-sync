import React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import styles from "./Tabs.module.css";

export const Tabs = RadixTabs.Root;

export const TabsList: React.FC<RadixTabs.TabsListProps> = ({ className, ...props }) => (
  <RadixTabs.List className={`${styles.list} ${className || ""}`} {...props} />
);

export const TabsTrigger: React.FC<RadixTabs.TabsTriggerProps> = ({ className, ...props }) => (
  <RadixTabs.Trigger className={`${styles.trigger} ${className || ""}`} {...props} />
);

export const TabsContent: React.FC<RadixTabs.TabsContentProps> = ({ className, ...props }) => (
  <RadixTabs.Content className={`${styles.content} ${className || ""}`} {...props} />
);
