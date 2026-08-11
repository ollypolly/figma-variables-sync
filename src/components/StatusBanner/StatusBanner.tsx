import { Banner, IconCheck16, IconWarning16, Link } from "@create-figma-plugin/ui";
import { h } from "preact";

interface StatusBannerProps {
  status: { success: boolean; text: string; link?: string } | null;
}

export function StatusBanner({ status }: StatusBannerProps) {
  if (!status) return null;

  return (
    <Banner
      icon={status.success ? <IconCheck16 /> : <IconWarning16 />}
      variant={status.success ? "success" : "warning"}
    >
      {status.link ? (
        <Link href={status.link} target="_blank">
          {status.text}
        </Link>
      ) : (
        status.text
      )}
    </Banner>
  );
}
