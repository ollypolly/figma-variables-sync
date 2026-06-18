import {
  Container,
  render,
  Tabs,
  Text,
  VerticalSpace,
  useWindowResize,
} from "@create-figma-plugin/ui";
import { emit } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useState } from "preact/hooks";

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
    { value: "Updates", children: <UpdatesTab /> },
    { value: "Proposals", children: <ProposalsTab /> },
    { value: "Settings", children: <SettingsTab /> },
  ];

  return (
    <Container space="medium">
      <VerticalSpace space="small" />
      <Tabs
        options={tabOptions}
        value={tabValue}
        onValueChange={setTabValue}
      />
    </Container>
  );
}

function UpdatesTab() {
  return (
    <Container space="medium">
      <VerticalSpace space="medium" />
      <Text>Updates tab — check for incoming changes from GitHub.</Text>
    </Container>
  );
}

function ProposalsTab() {
  return (
    <Container space="medium">
      <VerticalSpace space="medium" />
      <Text>Proposals tab — push Figma changes to GitHub as a PR.</Text>
    </Container>
  );
}

function SettingsTab() {
  return (
    <Container space="medium">
      <VerticalSpace space="medium" />
      <Text>Settings tab — configure GitHub connection.</Text>
    </Container>
  );
}

export default render(Plugin);
