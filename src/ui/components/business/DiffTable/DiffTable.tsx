import React from "react";
import { DiffItem } from "@ui/utils/diff";
import styles from "./DiffTable.module.css";

interface DiffTableProps {
  items: DiffItem[];
  mode: "proposals" | "updates";
}

export const DiffTable: React.FC<DiffTableProps> = ({ items, mode }) => {
  return (
    <div className={styles.diffTable}>
      <div className={styles.tableHeader}>
        <div className={styles.colName}>Token</div>
        <div className={styles.colType}>Change</div>
        <div className={styles.colChange}>Detail</div>
      </div>

      <div className={styles.tableBody}>
        {items.map((item) => {
          // Detect if it looks like a color value
          const isColor =
            item.dotPath.toLowerCase().includes("color") ||
            item.gitVal.startsWith("#") ||
            item.figmaVal.startsWith("#");

          const hasColorBox = isColor && (item.gitVal.startsWith("#") || item.figmaVal.startsWith("#"));

          // Set correct new/old val display based on mode
          const newVal = mode === "proposals" ? item.figmaVal : item.gitVal;
          const oldVal = mode === "proposals" ? item.gitVal : item.figmaVal;

          return (
            <div key={item.dotPath} className={styles.tableRow}>
              <div className={styles.colName}>
                <span className={styles.tokenPath}>
                  {item.path.slice(0, -1).join(" / ")}
                </span>
                <span className={styles.tokenName}>
                  {item.path[item.path.length - 1]}
                </span>
              </div>
              <div className={styles.colType}>
                <span className={styles.typeTag}>{item.type}</span>
              </div>
              <div className={styles.colChange}>
                {item.type === "added" && (
                  <div className={styles.changeAdded}>
                    {hasColorBox && (
                      <span
                        className={styles.colorBox}
                        style={{ backgroundColor: newVal.split(" ")[0] }}
                      />
                    )}
                    <span className={styles.newVal}>{newVal}</span>
                  </div>
                )}
                {item.type === "deleted" && (
                  <div className={styles.changeDeleted}>
                    {hasColorBox && (
                      <span
                        className={styles.colorBox}
                        style={{ backgroundColor: oldVal.split(" ")[0] }}
                      />
                    )}
                    <span className={styles.oldVal}>{oldVal}</span>
                  </div>
                )}
                {item.type === "modified" && (
                  <div className={styles.changeModified}>
                    <div className={styles.valComparison}>
                      {hasColorBox && oldVal && (
                        <span
                          className={styles.colorBox}
                          style={{ backgroundColor: oldVal.split(" ")[0] }}
                        />
                      )}
                      {oldVal && <span className={styles.oldVal}>{oldVal}</span>}
                      {oldVal && newVal && <span className={styles.arrow}>→</span>}
                      {hasColorBox && newVal && (
                        <span
                          className={styles.colorBox}
                          style={{ backgroundColor: newVal.split(" ")[0] }}
                        />
                      )}
                      {newVal && <span className={styles.newVal}>{newVal}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
