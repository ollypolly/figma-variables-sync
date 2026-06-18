import { emit, on } from "@create-figma-plugin/utilities";

import type {
  ExportResultHandler,
  ImportResultHandler,
  RequestExportHandler,
  RequestImportHandler,
} from "../types";

export function requestExport(): Promise<string> {
  return new Promise((resolve) => {
    const cleanup = on<ExportResultHandler>("EXPORT_RESULT", (json) => {
      cleanup();
      resolve(json);
    });
    emit<RequestExportHandler>("REQUEST_EXPORT");
  });
}

export function requestImport(
  dtcgJson: string
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const cleanup = on<ImportResultHandler>(
      "IMPORT_RESULT",
      (success, message) => {
        cleanup();
        resolve({ success, message });
      }
    );
    emit<RequestImportHandler>("REQUEST_IMPORT", dtcgJson);
  });
}
