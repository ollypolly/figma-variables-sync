import { Bold, Divider, Muted, Text, VerticalSpace } from "@create-figma-plugin/ui";
import { h } from "preact";

import type { DiffItem } from "../common/diff";

interface DiffListProps {
  items: DiffItem[];
  mode: "updates" | "proposals";
}

export function DiffList({ items, mode }: DiffListProps) {
  return (
    <div>
      {items.map((item, i) => {
        const newVal = mode === "proposals" ? item.figmaVal : item.gitVal;
        const oldVal = mode === "proposals" ? item.gitVal : item.figmaVal;
        const prefix =
          item.type === "added" ? "+" : item.type === "deleted" ? "−" : "~";

        return (
          <div key={item.dotPath}>
            {i > 0 && <Divider />}
            <div style={{ padding: "6px 0" }}>
              <Text>
                <Bold>
                  {prefix} {item.dotPath}
                </Bold>
              </Text>
              <VerticalSpace space="extraSmall" />
              {item.type === "modified" && (
                <Text>
                  <Muted>
                    {oldVal} → {newVal}
                  </Muted>
                </Text>
              )}
              {item.type === "added" && (
                <Text>
                  <Muted>{newVal}</Muted>
                </Text>
              )}
              {item.type === "deleted" && (
                <Text>
                  <Muted>{oldVal}</Muted>
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
