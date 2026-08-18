import { Banner, IconCheck16, IconWarning16, Link } from "@create-figma-plugin/ui";
import { Fragment, h, type ComponentChildren } from "preact";

interface StatusBannerProps {
  status: { success: boolean; text: string; link?: string } | null;
}

const URL_PATTERN = /https?:\/\/\S+?(?=[.,;:!?]?(?:\s|$))/g;

function linkifyUrls(text: string): ComponentChildren {
  const urls = text.match(URL_PATTERN);
  if (!urls) return text;

  const parts = text.split(URL_PATTERN);
  return (
    <Fragment>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {urls[i] && (
            <Link href={urls[i]} target="_blank">
              {urls[i]}
            </Link>
          )}
        </Fragment>
      ))}
    </Fragment>
  );
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
        linkifyUrls(status.text)
      )}
    </Banner>
  );
}
