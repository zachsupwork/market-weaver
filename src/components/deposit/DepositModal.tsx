import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy, Check, ArrowDownToLine, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createDepositAddress } from "@/lib/polymarket-api";
import { toast } from "sonner";

const SUPPORTED_CHAINS = [
  { id: "evm", label: "Ethereum / Polygon / Base", field: "evm" },
  { id: "svm", label: "Solana", field: "svm" },
  { id: "tvm", label: "Tron", field: "tvm" },
  { id: "btc", label: "Bitcoin", field: "btc" },
] as const;

interface DepositModalProps {
  trigger?: React.ReactNode;
  balance?: string;
}

export function DepositModal({ trigger, balance }: DepositModalProps) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState("evm");
  const [loading, setLoading] = useState(false);
  const [addresses, setAddresses] = useState<Record<string, string> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && address && !addresses) {
      loadAddress();
    }
  }, [open, address]);

  async function loadAddress() {
    if (!address) return;
    setLoading(true);
    try {
      const result = await createDepositAddress(address);
      if (result.ok && result.deposit) {
        const addrs = result.deposit.address || result.deposit.addresses || {};
        setAddresses(addrs);
      } else {
        toast.error(result.error || "Failed to get deposit address");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedChain = SUPPORTED_CHAINS.find((c) => c.id === chain);
  const depositAddr = addresses?.[selectedChain?.field || "evm"] || "";

  function copyAddr() {
    if (!depositAddr) return;
    navigator.clipboard.writeText(depositAddr);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-1.5">
            <ArrowDownToLine className="h-4 w-4" /> Deposit via Bridge
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Deposit to Polymarket Bridge
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-[10px] text-warning font-medium mb-1">⚠️ Bridge Deposit Address</p>
            <p className="text-[10px] text-muted-foreground">
              This address is for depositing crypto via the Polymarket Bridge. Funds will be converted to USDC.e and credited to your Polymarket account. This is <strong>not</strong> your trading wallet address.
            </p>
          </div>

          {/* Balance display */}
          {balance && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <span className="text-xs text-muted-foreground block">Portfolio Balance</span>
              <span className="text-2xl font-mono font-bold">${balance}</span>
            </div>
          )}

          {/* Chain selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Send From Chain</label>
            <Select value={chain} onValueChange={setChain}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CHAINS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[9px] text-muted-foreground">
              Send any supported token from this chain. It will be converted to USDC.e automatically.
            </p>
          </div>

          {/* Deposit address */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : depositAddr ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-lg">
                  <QRCodeSVG value={depositAddr} size={160} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono break-all bg-background rounded px-3 py-2 border border-border">
                  {depositAddr}
                </code>
                <Button variant="outline" size="icon" onClick={copyAddr} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-yes" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <p className="text-[10px] text-destructive/80 text-center">
                ⚠️ Only send supported assets from the selected chain. Sending unsupported tokens may cause permanent loss.
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                No address available for this chain.
              </p>
              <Button variant="outline" size="sm" onClick={loadAddress} disabled={loading}>
                Retry
              </Button>
            </div>
          )}

          <Button variant="link" size="sm" className="px-0 h-auto text-xs w-full justify-center" asChild>
            <a href="https://bridge.polymarket.com/supported-assets" target="_blank" rel="noopener noreferrer">
              View Supported Assets <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
