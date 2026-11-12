export type StorageReader = Pick<Storage, "getItem">;
export type StorageWriter = Pick<Storage, "setItem">;

export function browserLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readPreference(key: string): string | null {
  try {
    return browserLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    browserLocalStorage()?.setItem(key, value);
  } catch {
    /* The preference still applies to this tab. */
  }
}

export function removeBrowserValue(key: string): boolean {
  try {
    browserLocalStorage()?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
