import {
  Banner,
  Button,
  Columns,
  Container,
  IconCheck16,
  IconWarning16,
  Muted,
  Text,
  Textbox,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { useSettings } from "./useSettings";

export function SettingsTab() {
  const {
    settings,
    loading,
    saving,
    testing,
    status,
    updateField,
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
        <Muted>Personal Access Token</Muted>
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

      <VerticalSpace space="large" />
      <Columns space="small">
        <Button onClick={handleSave} loading={saving} fullWidth>
          Save
        </Button>
        <Button
          onClick={handleTestConnection}
          loading={testing}
          secondary
          fullWidth
        >
          Test Connection
        </Button>
      </Columns>

      {status && (
        <Fragment>
          <VerticalSpace space="small" />
          <Banner
            icon={status.success ? <IconCheck16 /> : <IconWarning16 />}
            variant={status.success ? "success" : "warning"}
          >
            {status.text}
          </Banner>
        </Fragment>
      )}

      <VerticalSpace space="medium" />
    </Container>
  );
}
