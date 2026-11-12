import { createContext, useContext } from "react";

export interface HelpState {
  readonly active?: string;
  readonly enabled: boolean;
  show(label: string, automatic?: boolean): void;
  dismiss(label: string): void;
}

export const HelpContext = createContext<HelpState>({
  enabled: true,
  show: () => undefined,
  dismiss: () => undefined,
});
export const useHelp = () => useContext(HelpContext);
