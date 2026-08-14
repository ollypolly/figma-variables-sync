import { render, Tabs, useWindowResize } from "@create-figma-plugin/ui";
import { useStore } from "@nanostores/preact";
import { emit } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

import { $activeProposalLoading } from "@stores/activeProposalStore";
import { initProposalsSync } from "@stores/proposalsStore";
import { $isConfigured } from "@stores/settingsStore";
import { FeedbackButton } from "@components/FeedbackButton";
import { ProposalsTab } from "@tabs/ProposalsTab";
import { SettingsTab } from "@tabs/SettingsTab";

import { ResizeWindowHandler } from "./types";
import "!./output.css";

function Plugin() {
  const [tabValue, setTabValue] = useState<string>("Changes");
  const isConfigured = useStore($isConfigured);
  const activeProposalLoading = useStore($activeProposalLoading);

  useEffect(() => {
    if (!isConfigured || activeProposalLoading) return;
    return initProposalsSync();
  }, [isConfigured, activeProposalLoading]);

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
    { value: "Changes", children: <ProposalsTab /> },
    { value: "Settings", children: <SettingsTab /> },
  ];

  return (
    <div class="flex flex-col h-screen overflow-hidden isolate">
      <FeedbackButton />
      <Tabs
        options={tabOptions}
        value={tabValue}
        onValueChange={setTabValue}
      />
    </div>
  );
}

export default render(Plugin);
