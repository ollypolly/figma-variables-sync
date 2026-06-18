import {
  Bold,
  Container,
  Muted,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";

interface TabGuardProps {
  loading: boolean;
  isConfigured: boolean;
  children: ComponentChildren;
}

export function TabGuard({ loading, isConfigured, children }: TabGuardProps) {
  if (loading) {
    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>
          <Muted>Loading…</Muted>
        </Text>
      </Container>
    );
  }

  if (!isConfigured) {
    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>
          <Bold>Not configured</Bold>
        </Text>
        <VerticalSpace space="extraSmall" />
        <Text>
          <Muted>Set up your GitHub connection in the Settings tab.</Muted>
        </Text>
      </Container>
    );
  }

  return <Fragment>{children}</Fragment>;
}
