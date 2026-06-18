import {
  Banner,
  IconCheck16,
  IconWarning16,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

interface StatusBannerProps {
  status: { success: boolean; text: string } | null;
}

export function StatusBanner({ status }: StatusBannerProps) {
  if (!status) return null;

  return (
    <Fragment>
      <Banner
        icon={status.success ? <IconCheck16 /> : <IconWarning16 />}
        variant={status.success ? "success" : "warning"}
      >
        {status.text}
      </Banner>
      <VerticalSpace space="medium" />
    </Fragment>
  );
}
