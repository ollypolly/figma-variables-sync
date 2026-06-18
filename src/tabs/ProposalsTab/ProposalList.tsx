import {
  Divider,
  Link,
  Muted,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { h } from "preact";

import type { Proposal } from "./useProposals";

export function ProposalList({ proposals }: { proposals: Proposal[] }) {
  return (
    <div>
      {proposals.map((pr, i) => (
        <div key={pr.number}>
          {i > 0 && <Divider />}
          <div style={{ padding: "6px 0" }}>
            <Text>
              <Link href={pr.html_url} target="_blank">
                #{pr.number}
              </Link>{" "}
              {pr.title}
            </Text>
            <VerticalSpace space="extraSmall" />
            <Text>
              <Muted>
                {pr.state === "merged"
                  ? "Merged"
                  : pr.state === "open"
                    ? "Open"
                    : "Closed"}
              </Muted>
            </Text>
          </div>
        </div>
      ))}
    </div>
  );
}
