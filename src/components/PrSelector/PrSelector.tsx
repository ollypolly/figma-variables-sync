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

export function PrSelector({ activeProposal, openProposals, onSelect, disabled }: PrSelectorProps) {
  // The dropdown's `value` must always match an option, or it throws. On every tab remount
  // openProposals starts empty until check() resolves, so a persisted activeProposal needs to
  // be represented here too — not just once the fetch catches up.
  const selectableProposals =
    activeProposal && !openProposals.some((p) => p.number === activeProposal.number)
      ? [activeProposal, ...openProposals]
      : openProposals;

  const options: DropdownOption[] = [
    { value: "main", text: "Main" },
    ...(selectableProposals.length > 0 ? (["-"] as const) : []),
    ...selectableProposals.map((p) => ({ value: String(p.number), text: `#${p.number} ${p.title}` })),
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
      <div class="flex-1">
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
          style={{ display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}
        >
          <IconLink16 />
          View PR
        </Link>
      )}
      <Button secondary onClick={() => onSelect(null)} disabled={disabled}>
        New Request
      </Button>
    </div>
  );
}
