import { Button, LoadingIndicator, Modal, Text, Textbox } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { copyToClipboard } from "@utils/clipboard";

interface ExportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  json: string | undefined;
  loading: boolean;
  error?: string | null;
}

function downloadJson(json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "design-tokens.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportPreviewModal({ open, onClose, json, loading, error }: ExportPreviewModalProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [query, setQuery] = useState("");
  const firstMatchRef = useRef<HTMLDivElement | null>(null);

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const handleCopy = async () => {
    if (!json) return;
    const success = await copyToClipboard(json);
    setCopyState(success ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const lines = useMemo(() => json?.split("\n") ?? [], [json]);
  const needle = query.trim().toLowerCase();
  const firstMatchIndex = needle ? lines.findIndex((line) => line.toLowerCase().includes(needle)) : -1;

  useEffect(() => {
    firstMatchRef.current?.scrollIntoView({ block: "center" });
  }, [query]);

  return (
    <Modal open={open} title="Export preview" onCloseButtonClick={handleClose} onOverlayClick={handleClose} position="center">
      <div style={{ width: "480px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {loading ? (
          <LoadingIndicator />
        ) : error ? (
          <Text>
            <span style={{ color: "var(--figma-color-text-danger)" }}>{error}</span>
          </Text>
        ) : (
          <Fragment>
            <Textbox
              value={query}
              onValueInput={setQuery}
              placeholder="Find a token path or field name"
            />
            <div
              style={{
                margin: 0,
                maxHeight: "400px",
                overflow: "auto",
                padding: "8px",
                borderRadius: "4px",
                backgroundColor: "var(--figma-color-bg-secondary)",
                fontFamily: "monospace",
                fontSize: "11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {lines.map((line, i) => {
                const isMatch = needle && line.toLowerCase().includes(needle);
                return (
                  <div
                    key={i}
                    ref={isMatch && i === firstMatchIndex ? firstMatchRef : undefined}
                    style={isMatch ? { backgroundColor: "rgba(255, 220, 0, 0.35)" } : undefined}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          </Fragment>
        )}
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={handleCopy} disabled={!json} secondary>
            {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy"}
          </Button>
          <Button onClick={() => json && downloadJson(json)} disabled={!json} secondary>
            Download
          </Button>
        </div>
      </div>
    </Modal>
  );
}
