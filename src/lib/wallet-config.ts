import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygon } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

export const walletConnectConfigured = !!projectId;

export const walletConfig = getDefaultConfig({
  appName: "PolyView",
  projectId: projectId || "PLACEHOLDER_NO_DEEP_LINKS",
  chains: [polygon],
  ssr: false,
});
