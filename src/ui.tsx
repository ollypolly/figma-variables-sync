import { render, Tabs, useWindowResize } from "@create-figma-plugin/ui";
import { emit } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useState } from "preact/hooks";

import { AppProvider, useAppContext } from "@hooks/useAppContext";
import { ProposalsTab } from "@tabs/ProposalsTab";
import { SettingsTab } from "@tabs/SettingsTab";
import { UpdatesTab } from "@tabs/UpdatesTab";

import { ResizeWindowHandler } from "./types";
import "!./output.css";

function Notices() {
  const { notices, dismissNotice } = useAppContext();
  if (notices.length === 0) return null;

  return (
    <div class="flex flex-col">
      {notices.map((notice) => (
        <div
          key={notice.id}
          class="flex items-center justify-between px-2 py-1 bg-yellow-100 text-yellow-900 text-xs"
        >
          <span>{notice.message}</span>
          <button onClick={() => dismissNotice(notice.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}

function Plugin() {
  const [tabValue, setTabValue] = useState<string>("Changes");

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
    { value: "Changes", children: <ProposalsTab active={tabValue === "Changes"} /> },
    { value: "Updates", children: <UpdatesTab active={tabValue === "Updates"} /> },
    { value: "Settings", children: <SettingsTab /> },
  ];

  return (
    <div class="flex flex-col h-screen overflow-hidden">
      <Notices />
      <Tabs
        options={tabOptions}
        value={tabValue}
        onValueChange={setTabValue}
      />
    </div>
  );
}

function Root() {
  return (
    <AppProvider>
      <Plugin />
    </AppProvider>
  );
}

export default render(Root);
