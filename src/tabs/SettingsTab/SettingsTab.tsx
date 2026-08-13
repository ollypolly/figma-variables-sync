import {
  Bold,
  Button,
  Columns,
  Container,
  Divider,
  Link,
  Muted,
  Text,
  Textbox,
  Toggle,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { h } from "preact";

import { StatusBanner } from "@components/StatusBanner";

import { useSettings } from "./useSettings";

export function SettingsTab() {
  const {
    settings,
    loading,
    saving,
    testing,
    status,
    updateField,
    updateBooleanField,
    handleSave,
    handleTestConnection,
  } = useSettings();

  if (loading) {
    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>
          <Muted>Loading settings…</Muted>
        </Text>
      </Container>
    );
  }

  return (
    <Container space="medium">
      <VerticalSpace space="medium" />

      <Text>
        <Bold>Repository Setup</Bold>
      </Text>

      <VerticalSpace space="medium" />
      <Text>
        <Muted>
          Personal Access Token{" "}
          <Link href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank">
            (how to create one)
          </Link>
        </Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>Needs Contents read/write and Pull requests read/write scopes.</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Textbox
        value={settings.pat}
        onValueInput={updateField("pat")}
        placeholder="github_pat_..."
        password
      />

      <VerticalSpace space="medium" />
      <Columns space="small">
        <div>
          <Text>
            <Muted>Owner</Muted>
          </Text>
          <VerticalSpace space="extraSmall" />
          <Textbox
            value={settings.owner}
            onValueInput={updateField("owner")}
            placeholder="e.g. facebook"
          />
        </div>
        <div>
          <Text>
            <Muted>Repository</Muted>
          </Text>
          <VerticalSpace space="extraSmall" />
          <Textbox
            value={settings.repo}
            onValueInput={updateField("repo")}
            placeholder="e.g. design-system"
          />
        </div>
      </Columns>

      <VerticalSpace space="medium" />
      <Text>
        <Muted>File Path</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Textbox
        value={settings.filePath}
        onValueInput={updateField("filePath")}
        placeholder="tokens/design-tokens.json"
      />

      <VerticalSpace space="medium" />
      <Text>
        <Muted>Branch</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Textbox
        value={settings.branch}
        onValueInput={updateField("branch")}
        placeholder="main"
      />

      <VerticalSpace space="medium" />
      <Button
        onClick={handleTestConnection}
        loading={testing}
        secondary
        fullWidth
      >
        Test Connection
      </Button>

      <VerticalSpace space="large" />
      <Divider />
      <VerticalSpace space="medium" />
      <Text>
        <Bold>Pull Request Setup</Bold>
      </Text>

      <VerticalSpace space="medium" />
      <Text>
        <Muted>Labels</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>Comma-separated. Applied to every PR this plugin creates.</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Textbox
        value={settings.prLabels}
        onValueInput={updateField("prLabels")}
        placeholder="e.g. patch, figma-variables-sync"
      />

      <VerticalSpace space="large" />
      <Divider />
      <VerticalSpace space="medium" />
      <Text>
        <Bold>Sync Behavior</Bold>
      </Text>

      <VerticalSpace space="medium" />
      <Toggle
        value={settings.skipSwitchConfirmation}
        onValueChange={updateBooleanField("skipSwitchConfirmation")}
      >
        <Text>Skip confirmation when switching PRs or going back to {settings.branch}</Text>
      </Toggle>

      <VerticalSpace space="large" />
      <Button onClick={handleSave} loading={saving} fullWidth>
        Save
      </Button>

      <VerticalSpace space="small" />
      <StatusBanner status={status} />

      <VerticalSpace space="medium" />
    </Container>
  );
}
