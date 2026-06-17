import React from "react";
import styles from "./ProposalList.module.css";

export interface Proposal {
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | string;
  html_url: string;
  head_ref: string;
}

interface ProposalListProps {
  proposals: Proposal[];
}

export const ProposalList: React.FC<ProposalListProps> = ({ proposals }) => {
  return (
    <div className={styles.list}>
      {proposals.map((pr) => {
        let badgeClass = styles.badge;
        let displayState = pr.state;

        if (pr.state === "open") {
          badgeClass += ` ${styles.open}`;
          displayState = "Pending Review";
        } else if (pr.state === "merged") {
          badgeClass += ` ${styles.merged}`;
          displayState = "Approved & Published";
        } else {
          badgeClass += ` ${styles.closed}`;
          displayState = "Closed";
        }

        return (
          <div key={pr.number} className={styles.item}>
            <div className={styles.left}>
              <a
                href={pr.html_url}
                target="_blank"
                rel="noreferrer"
                className={styles.title}
              >
                #{pr.number} {pr.title}
              </a>
              <span className={styles.meta}>Branch: {pr.head_ref}</span>
            </div>
            <span className={badgeClass}>{displayState}</span>
          </div>
        );
      })}
    </div>
  );
};
