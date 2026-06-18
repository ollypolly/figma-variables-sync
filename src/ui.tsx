import { render, Tabs, useWindowResize } from "@create-figma-plugin/ui";
import { emit } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useState } from "preact/hooks";

import { ProposalsTab } from "@tabs/ProposalsTab";
import { SettingsTab } from "@tabs/SettingsTab";
import { UpdatesTab } from "@tabs/UpdatesTab";

import { ResizeWindowHandler } from "./types";
import "!./output.css";

function Plugin() {
  const [tabValue, setTabValue] = useState<string>("Updates");

  useWindowResize(
    function (windowSize) {
      emit<ResizeWindowHandler>("RESIZE_WINDOW", windowSize);
    },
    {
      minWidth: 360,
      minHeight: 320,
      maxWidth: 800,
      maxHeight: 800,
      resizeBehaviorOnDoubleClick: "minimize",
    }
  );

  const tabOptions = [
    { value: "Updates", children: <UpdatesTab active={tabValue === "Updates"} /> },
    { value: "Proposals", children: <ProposalsTab active={tabValue === "Proposals"} /> },
    { value: "Settings", children: <SettingsTab /> },
  ];

  return (
    <div class="flex flex-col h-screen overflow-hidden">
      <Tabs
        options={tabOptions}
        value={tabValue}
        onValueChange={setTabValue}
      />
    </div>
  );
}

export default render(Plugin);
