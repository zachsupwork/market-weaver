import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, ExternalLink, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

const USDC_E_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const LIFI_BASE = "https://transferto.xyz/swap";

interface FundUsdcModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  traderAddress: string;
  onRefresh: () => void;
}

export function FundUsdcModal({ open, onOpenChange, traderAddress, onRefresh }: FundUsdcModalProps) {
  const [copied, setCopied] = useState(false);
  const onRampUrl = import.meta.env.VITE_ONRAMP_URL as string | undefined;

  function copyAddress() {
    navigator.clipboard.writeText(traderAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  }

  const lifiUrl = `${LIFI_BASE}?toChain=pol&toToken=${USDC_E_CONTRACT}&toAddress=${traderAddress}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Fund USDC.e on Polygon</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="send" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="send" className="flex-1 text-xs">Send</TabsTrigger>
            <TabsTrigger value="bridge" className="flex-1 text-xs">Bridge</TabsTrigger>
            <TabsTrigger value="card" className="flex-1 text-xs">Buy</TabsTrigger>
          </TabsList>

          {/* TAB 1: Send */}
          <TabsContent value="send" className="space-y-4 mt-3">
            <div className="flex justify-center">
              <div className="rounded-xl border border-border bg-background p-3">
                <QRCodeSVG value={traderAddress} size={160} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Wallet Address</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 text-xs font-mono break-all">
                  {traderAddress}
                </code>
                <button type="button" onClick={copyAddress}
                  className="shrink-0 rounded-md border border-border p-2 hover:bg-accent transition-all">
                  {copied ? <Check className="h-3.5 w-3.5 text-yes" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
              <p className="text-[11px] text-muted-foreground"><strong>Network:</strong> Polygon</p>
              <p className="text-[11px] text-muted-foreground"><strong>Token:</strong> USDC.e (Bridged USDC)</p>
              <p className="text-[11px] text-muted-foreground">
                <strong>Contract:</strong>{" "}
                <code className="text-[10px] font-mono">{USDC_E_CONTRACT}</code>
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Send USDC on Polygon (USDC.e) to this address. Then tap Refresh below.
            </p>
          </TabsContent>

          {/* TAB 2: Bridge */}
          <TabsContent value="bridge" className="space-y-4 mt-3">
            <p className="text-xs text-muted-foreground">
              Have USDC on another chain? Bridge it to Polygon USDC.e using LI.FI.
            </p>
            <a href={lifiUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-all">
              Open Bridge <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <div className="rounded-md bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">
                Destination is pre-filled to <strong>Polygon USDC.e</strong> at your address.
                After bridging, tap Refresh below.
              </p>
            </div>
          </TabsContent>

          {/* TAB 3: Buy */}
          <TabsContent value="card" className="space-y-4 mt-3">
            {onRampUrl ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Buy USDC with a debit card and have it sent to your Polygon wallet.
                </p>
                <a href={onRampUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-all">
                  Buy USDC <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-center">
                <p className="text-xs text-muted-foreground">Card on-ramp not configured for this app.</p>
                <p className="text-[10px] text-muted-foreground mt-1">Use the Send or Bridge tabs instead.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer refresh */}
        <button type="button" onClick={onRefresh}
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all">
          <RefreshCw className="h-3.5 w-3.5" /> I've sent funds — Refresh balance
        </button>
      </DialogContent>
    </Dialog>
  );
}
