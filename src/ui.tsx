import { render, Tabs, useWindowResize } from "@create-figma-plugin/ui";
import { emit } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useState } from "preact/hooks";

import { ContactEngineerNotice } from "@components/ContactEngineerNotice";
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
        <ContactEngineerNotice
          key={notice.id}
          message={notice.message}
          details={notice.details}
          onDismiss={() => dismissNotice(notice.id)}
        />
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
