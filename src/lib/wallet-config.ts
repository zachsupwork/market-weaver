import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygon } from "wagmi/chains";

export const walletConfig = getDefaultConfig({
  appName: "PolyView",
  projectId: "polyview-demo", // WalletConnect project ID - replace with real one for production
  chains: [polygon],
  ssr: false,
});
