import { IconButton, IconFeedback16 } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { FeedbackModal } from "./FeedbackModal";
import { useFeedback } from "./useFeedback";

export function FeedbackButton() {
  const feedback = useFeedback();

  return (
    <Fragment>
      <div style={{ position: "absolute", top: "6px", right: "8px", zIndex: 10 }}>
        <IconButton
          onClick={feedback.openModal}
          disabled={feedback.cooldown}
          title={feedback.cooldown ? "Thanks — you can send more feedback shortly" : "Send feedback"}
        >
          <IconFeedback16 />
        </IconButton>
      </div>
      <FeedbackModal {...feedback} />
    </Fragment>
  );
}
