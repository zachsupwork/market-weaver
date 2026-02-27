import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CHAINS = [
  { key: "evm", label: "EVM (Polygon / Ethereum / Base…)", field: "evm" },
  { key: "svm", label: "Solana", field: "svm" },
  { key: "tvm", label: "Tron", field: "tvm" },
  { key: "btc", label: "Bitcoin", field: "btc" },
] as const;

type ChainKey = (typeof CHAINS)[number]["key"];

interface Props {
  addresses: Record<string, string>;
  note?: string;
}

export function DepositAddressCard({ addresses, note }: Props) {
  const [chain, setChain] = useState<ChainKey>("evm");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const selected = CHAINS.find((c) => c.key === chain)!;
  const addr = addresses[selected.field] || "";

  function copy() {
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopied(true);
    toast({ title: "Address copied" });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Chain selector */}
      <div className="flex flex-wrap gap-2">
        {CHAINS.map((c) => (
          <Badge
            key={c.key}
            variant={chain === c.key ? "default" : "outline"}
            className="cursor-pointer select-none px-3 py-1.5 text-xs"
            onClick={() => setChain(c.key)}
          >
            {c.label}
          </Badge>
        ))}
      </div>

      {addr ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          {/* QR */}
          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={addr} size={160} />
            </div>
          </div>

          {/* Address */}
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs sm:text-sm font-mono break-all bg-background rounded px-3 py-2 border border-border">
              {addr}
            </code>
            <Button variant="outline" size="icon" onClick={copy} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          {/* Warning */}
          <p className="text-xs text-destructive/80">
            ⚠️ Only send supported assets from the selected chain. Sending unsupported tokens may cause permanent loss.
          </p>

          {/* Supported assets link */}
          <Button variant="link" size="sm" className="px-0 h-auto text-xs" asChild>
            <a href="https://bridge.polymarket.com/supported-assets" target="_blank" rel="noopener noreferrer">
              View Supported Assets <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>

          {note && (
            <p className="text-xs text-muted-foreground italic">{note}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No address available for {selected.label}.</p>
      )}
    </div>
  );
}
