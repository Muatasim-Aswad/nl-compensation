import { homedir } from "node:os";
import path from "node:path";
import { AppError } from "../shared/errors.js";

export interface StorageEnvironment {
  readonly XDG_DATA_HOME?: string;
  readonly HOME?: string;
}

export interface StoragePaths {
  readonly database: string;
}

export function storagePaths(environment: StorageEnvironment = process.env): StoragePaths {
  const dataRoot =
    environment.XDG_DATA_HOME || path.join(environment.HOME || homedir(), ".local", "share");
  if (!path.isAbsolute(dataRoot))
    throw new AppError("usage_error", "XDG_DATA_HOME must be an absolute path.");
  return { database: path.join(dataRoot, "nl-compensation", "compensation.sqlite3") };
}
