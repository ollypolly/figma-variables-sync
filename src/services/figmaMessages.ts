import { emit, on } from "@create-figma-plugin/utilities";
import { NamingCollisionError } from "@common/dtcg";

import type {
  ExportResultHandler,
  ImportResultHandler,
  RequestExportHandler,
  RequestImportHandler,
} from "../types";

export function requestExport(): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanup = on<ExportResultHandler>(
      "EXPORT_RESULT",
      (success, dtcgJson, error, collidingPaths) => {
        cleanup();
        if (success) {
          resolve(dtcgJson);
        } else if (collidingPaths && collidingPaths.length > 0) {
          reject(new NamingCollisionError(error || "Export failed.", collidingPaths));
        } else {
          reject(new Error(error || "Export failed."));
        }
      }
    );
    emit<RequestExportHandler>("REQUEST_EXPORT");
  });
}

export function requestImport(
  dtcgJson: string
): Promise<{ success: boolean; message: string; quarantined: string[] }> {
  return new Promise((resolve) => {
    const cleanup = on<ImportResultHandler>(
      "IMPORT_RESULT",
      (success, message, quarantined) => {
        cleanup();
        resolve({ success, message, quarantined: quarantined || [] });
      }
    );
    emit<RequestImportHandler>("REQUEST_IMPORT", dtcgJson);
  });
}
