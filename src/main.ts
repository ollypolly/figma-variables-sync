import { showUI } from "@create-figma-plugin/utilities";

import { registerFromFigmaHandlers } from "./handlers/fromFigmaHandlers";
import { registerToFigmaHandlers } from "./handlers/toFigmaHandlers";

export default function () {
  registerFromFigmaHandlers();
  registerToFigmaHandlers();
  showUI({ width: 480, height: 560 });
}
