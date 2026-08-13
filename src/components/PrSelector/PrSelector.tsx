import { Button, Dropdown, IconLink16, Link, type DropdownOption } from "@create-figma-plugin/ui";
import { h } from "preact";

import type { Proposal } from "@services/proposals";
import type { ActiveProposal } from "../../types";

interface PrSelectorProps {
  activeProposal: ActiveProposal | null;
  openProposals: Proposal[];
  onSelect: (proposal: ActiveProposal | null) => void;
  disabled?: boolean;
}

function withCurrentSelectionAlwaysListed(
  activeProposal: ActiveProposal | null,
  openProposals: Proposal[]
): Array<ActiveProposal | Proposal> {
  if (activeProposal && !openProposals.some((p) => p.number === activeProposal.number)) {
    return [activeProposal, ...openProposals];
  }
  return openProposals;
}

export function PrSelector({ activeProposal, openProposals, onSelect, disabled }: PrSelectorProps) {
  const dropdownProposals = withCurrentSelectionAlwaysListed(activeProposal, openProposals);

  const options: DropdownOption[] = [
    { value: "main", text: "Main" },
    ...(dropdownProposals.length > 0 ? (["-"] as const) : []),
    ...dropdownProposals.map((p) => ({ value: String(p.number), text: `#${p.number} ${p.title}` })),
  ];

  const handleValueChange = (value: string) => {
    if (value === "main") {
      onSelect(null);
      return;
    }
    const proposal = openProposals.find((p) => String(p.number) === value);
    if (proposal) onSelect(proposal);
  };

  return (
    <div class="flex gap-2 items-center">
      <div class="flex-1 min-w-0">
        <Dropdown
          options={options}
          value={activeProposal ? String(activeProposal.number) : "main"}
          onValueChange={handleValueChange}
          disabled={disabled}
        />
      </div>
      {activeProposal && (
        <Link
          href={activeProposal.html_url}
          target="_blank"
          title={`View PR #${activeProposal.number} on GitHub — ${activeProposal.title}`}
          style={{ display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          <IconLink16 />
          View PR
        </Link>
      )}
      <div class="shrink-0">
        <Button secondary onClick={() => onSelect(null)} disabled={disabled || !activeProposal}>
          New Request
        </Button>
      </div>
    </div>
  );
}
