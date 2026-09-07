import { IconButton, IconMore16, useMouseDownOutside } from "@create-figma-plugin/ui";
import { h } from "preact";
import { useRef, useState } from "preact/hooks";

interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
}

export function OverflowMenu({ items }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useMouseDownOutside({ ref, onMouseDownOutside: () => setOpen(false) });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconButton onClick={() => setOpen((prev) => !prev)} title="More actions">
        <IconMore16 />
      </IconButton>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            minWidth: "160px",
            backgroundColor: "var(--figma-color-bg)",
            border: "1px solid var(--figma-color-border)",
            borderRadius: "2px",
            boxShadow: "var(--box-shadow-menu)",
            zIndex: 20,
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              disabled={item.disabled}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                background: "none",
                border: "none",
                cursor: item.disabled ? "default" : "pointer",
                color: item.disabled ? "var(--figma-color-text-disabled)" : "var(--figma-color-text)",
                font: "inherit",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
