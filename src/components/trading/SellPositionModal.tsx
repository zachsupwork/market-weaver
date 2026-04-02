import { useState, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, DollarSign, TrendingDown, TrendingUp, AlertTriangle, X, BookOpen, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { postSignedOrder, checkUserCredsStatus, cancelOrder } from "@/lib/polymarket-api";
import { calculatePlatformFee, isFeeEnabled, FEE_WALLET_ADDRESS, ERC20_TRANSFER_ABI, PLATFORM_FEE_BPS } from "@/lib/platform-fee";
import { POLYGON_USDCE_ADDRESS } from "@/lib/constants/tokens";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "wagmi";
import { useProxyWallet } from "@/hooks/useProxyWallet";
import { ClobClient, Side as ClobSide } from "@polymarket/clob-client";
import { ethers } from "ethers";
import { useOrderbookWs } from "@/hooks/useOrderbookWs";
import { useOrders } from "@/hooks/useOrders";
import { format } from "date-fns";

export interface SellPositionData {
  asset: string;
  condition_id: string;
  size: string;
  avgPrice?: string;
  currentPrice?: string;
  currentValue?: string;
  market?: string;
  outcome?: string;
  cashPnl?: string;
  percentPnl?: string;
  marketImage?: string;
  tokenId?: string;
}

interface SellPositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: SellPositionData | null;
  onSellComplete?: () => void;
}

type OrderMode = "market" | "limit";
type TimeInForce = "GTC" | "GTD" | "FOK" | "FAK";

const TIF_OPTIONS: { id: TimeInForce; label: string; desc: string }[] = [
  { id: "GTC", label: "GTC", desc: "Good Till Cancel" },
  { id: "GTD", label: "GTD", desc: "Good Till Date" },
  { id: "FOK", label: "FOK", desc: "Fill or Kill" },
  { id: "FAK", label: "FAK", desc: "Fill & Kill" },
];

function snapToTick(price: number, tick: number): number {
  return Math.round(price / tick) * tick;
}

export function SellPositionModal({ open, onOpenChange, position, onSellComplete }: SellPositionModalProps) {
  const { address } = useAccount();
  const { proxyAddress } = useProxyWallet();
  const [sharesToSell, setSharesToSell] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"idle" | "fee" | "signing" | "placing">("idle");

  // Order type state
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [gtdDate, setGtdDate] = useState<Date | undefined>();
  const [gtdTime, setGtdTime] = useState("23:59");

  const size = parseFloat(position?.size || "0");
  const avgPrice = parseFloat(position?.avgPrice || "0");
  const currentPrice = parseFloat(position?.currentPrice || "0");
  const tokenId = position?.asset || position?.tokenId || "";
  const tickSize = 0.01;

  const feeEnabled = isFeeEnabled();
  const isLimitMode = orderMode === "limit";
  const parsedLimitPrice = parseFloat(limitPrice);
  const effectivePrice = isLimitMode && !isNaN(parsedLimitPrice) && parsedLimitPrice > 0
    ? parsedLimitPrice
    : (currentPrice > 0 ? snapToTick(currentPrice, tickSize) : 0);

  // Orderbook for this token
  const { book } = useOrderbookWs(open ? tokenId : undefined, { wsEnabled: open, pollInterval: 2000 });

  // Best bid from orderbook
  const bestBid = useMemo(() => {
    if (!book?.bids?.length) return null;
    return parseFloat(book.bids[0].price);
  }, [book]);

  // Open orders for this market
  const { orders: allOrders, refetch: refetchOrders } = useOrders(open, "live");
  const positionOrders = useMemo(() =>
    allOrders.filter(o => o.asset_id === tokenId && o.side === "SELL"),
    [allOrders, tokenId]
  );

  const estimatedProceeds = useMemo(() => sharesToSell * effectivePrice, [sharesToSell, effectivePrice]);
  const { fee: platformFee, netAmount } = useMemo(() => calculatePlatformFee(estimatedProceeds), [estimatedProceeds]);
  const costBasis = sharesToSell * avgPrice;
  const realizedPnl = estimatedProceeds - costBasis;

  const gtdExpiration = useMemo(() => {
    if (timeInForce !== "GTD" || !gtdDate) return 0;
    const [h, m] = gtdTime.split(":").map(Number);
    const d = new Date(gtdDate);
    d.setHours(h || 0, m || 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [timeInForce, gtdDate, gtdTime]);

  const limitPriceError = useMemo(() => {
    if (!isLimitMode || !limitPrice) return null;
    const p = parseFloat(limitPrice);
    if (isNaN(p)) return "Invalid price";
    if (p <= 0) return "Price must be positive";
    if (p >= 1) return "Price must be < $1.00";
    return null;
  }, [isLimitMode, limitPrice]);

  // Reset when position changes or modal opens
  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) {
      setSharesToSell(0);
      setStep("idle");
      setOrderMode("market");
      setLimitPrice("");
      setTimeInForce("GTC");
    }
    onOpenChange(v);
  }, [onOpenChange]);

  // Pre-fill limit price from best bid when switching to limit
  useEffect(() => {
    if (isLimitMode && !limitPrice && bestBid) {
      setLimitPrice(bestBid.toFixed(2));
    }
  }, [isLimitMode, limitPrice, bestBid]);

  async function handleCancelOrder(orderId: string) {
    try {
      const result = await cancelOrder(orderId);
      if (result.ok) {
        toast.success("Order cancelled");
        refetchOrders();
      } else {
        toast.error(result.error || "Cancel failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Cancel failed");
    }
  }

  async function handleSell() {
    if (!address || !position || sharesToSell <= 0) return;
    if (!tokenId) {
      toast.error("Missing token ID for this position.");
      return;
    }

    if (isLimitMode) {
      if (!limitPrice || isNaN(parsedLimitPrice) || parsedLimitPrice <= 0) {
        toast.error("Enter a valid limit price"); return;
      }
      if (limitPriceError) { toast.error(limitPriceError); return; }
      if (timeInForce === "GTD" && (!gtdDate || gtdExpiration <= Math.floor(Date.now() / 1000))) {
        toast.error("Select a future expiration date/time"); return;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in first"); return; }

    const credsStatus = await checkUserCredsStatus();
    if (!credsStatus.hasCreds || !credsStatus.address) {
      toast.error("Trading credentials missing. Re-enable trading in Settings.");
      return;
    }

    if (!(window as any).ethereum) { toast.error("Wallet provider not found"); return; }

    setSubmitting(true);
    try {
      // Step 1: Platform fee
      let feeTxHash: string | null = null;
      if (feeEnabled && platformFee > 0 && estimatedProceeds > 0) {
        setStep("fee");
        try {
          const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
          const feeSigner = provider.getSigner();
          const usdcContract = new ethers.Contract(POLYGON_USDCE_ADDRESS, ERC20_TRANSFER_ABI as any, feeSigner);
          const feeAmountWei = ethers.utils.parseUnits(platformFee.toFixed(6), 6);
          const feeTx = await usdcContract.transfer(FEE_WALLET_ADDRESS, feeAmountWei);
          await feeTx.wait();
          feeTxHash = feeTx.hash;
          toast.success("Platform fee paid ✓");
          try {
            await supabase.from("platform_fees").insert({
              user_address: address.toLowerCase(),
              order_condition_id: position.condition_id ?? null,
              fee_amount: platformFee,
              fee_bps: PLATFORM_FEE_BPS,
              tx_hash: feeTxHash,
            } as any);
          } catch {}
        } catch (feeErr: any) {
          if (feeErr?.code === 4001 || feeErr?.code === "ACTION_REJECTED") {
            toast.error("Fee transfer rejected. Sell cancelled.");
          } else {
            toast.error(`Fee transfer failed: ${feeErr.message}`);
          }
          setSubmitting(false); setStep("idle"); return;
        }
      }

      // Step 2: Sign
      setStep("signing");
      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      const signer = provider.getSigner();
      const useProxy = !!proxyAddress;
      const clobClient = new ClobClient(
        "https://clob.polymarket.com", 137, signer, undefined,
        useProxy ? 2 : 0, useProxy ? proxyAddress : undefined,
      );

      const sellPrice = isLimitMode ? parsedLimitPrice : (currentPrice > 0 ? snapToTick(currentPrice, tickSize) : currentPrice);
      const sellSize = Number(sharesToSell.toFixed(6));
      const orderExpiration = timeInForce === "GTD" ? gtdExpiration : 0;
      const effectiveOrderType = isLimitMode ? timeInForce : "GTC";

      console.log("[SellModal] Creating sell order:", { tokenId, price: sellPrice, size: sellSize, mode: orderMode, tif: effectiveOrderType });

      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        side: ClobSide.SELL,
        price: sellPrice,
        size: sellSize,
        feeRateBps: 0,
        expiration: orderExpiration,
      });

      // Step 3: Post
      setStep("placing");
      const eoaAddr = (await signer.getAddress()).toLowerCase();
      const result = await postSignedOrder(signedOrder, effectiveOrderType, eoaAddr);

      if (result.ok) {
        const modeLabel = isLimitMode ? "Limit" : "Market";
        toast.success(`${modeLabel} sell: ${sellSize} ${position.outcome || ""} shares @ ${(sellPrice * 100).toFixed(1)}¢`);
        handleOpenChange(false);
        onSellComplete?.();
        refetchOrders();
      } else {
        toast.error(result.error || "Sell order failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Sell order failed");
    } finally {
      setSubmitting(false);
      setStep("idle");
    }
  }

  if (!position) return null;

  const stepLabel = step === "fee" ? "Paying fee…" : step === "signing" ? "Sign in wallet…" : step === "placing" ? "Placing order…" : "Sell";
  const topBids = book?.bids?.slice(0, 5) || [];
  const topAsks = book?.asks?.slice(0, 5) || [];
  const maxBookSize = Math.max(
    ...topBids.map(b => parseFloat(b.size)),
    ...topAsks.map(a => parseFloat(a.size)),
    1
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Sell Position</DialogTitle>
          <DialogDescription className="sr-only">Sell shares from your position</DialogDescription>
        </DialogHeader>

        {/* Market info */}
        <div className="flex items-start gap-3 pb-3 border-b border-border">
          {position.marketImage && (
            <img src={position.marketImage} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight line-clamp-2">
              {position.market || "Unknown Market"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant={position.outcome === "Yes" ? "default" : "destructive"} className="text-[10px] h-5">
                {position.outcome || "Unknown"}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">{size.toFixed(2)} shares</span>
            </div>
          </div>
        </div>

        {/* Price info */}
        <div className="grid grid-cols-3 gap-3 py-2">
          <div>
            <span className="text-xs text-muted-foreground block">Avg Entry</span>
            <span className="font-mono text-sm font-semibold">{(avgPrice * 100).toFixed(1)}¢</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Current</span>
            <span className={cn("font-mono text-sm font-semibold", currentPrice > avgPrice ? "text-yes" : "text-no")}>
              {(currentPrice * 100).toFixed(1)}¢
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Best Bid</span>
            <span className="font-mono text-sm font-semibold text-yes">
              {bestBid ? `${(bestBid * 100).toFixed(1)}¢` : "—"}
            </span>
          </div>
        </div>

        {/* Order Book Preview */}
        {(topBids.length > 0 || topAsks.length > 0) && (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Order Book</span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
              {/* Bids */}
              <div>
                <div className="flex justify-between text-muted-foreground mb-1 px-1">
                  <span>Price</span><span>Size</span>
                </div>
                {topBids.map((b, i) => {
                  const pct = (parseFloat(b.size) / maxBookSize) * 100;
                  return (
                    <div key={i} className="relative flex justify-between px-1 py-0.5 rounded-sm cursor-pointer hover:bg-yes/10"
                      onClick={() => { setOrderMode("limit"); setLimitPrice(parseFloat(b.price).toFixed(2)); }}>
                      <div className="absolute inset-y-0 left-0 bg-yes/8 rounded-sm" style={{ width: `${pct}%` }} />
                      <span className="relative text-yes">{(parseFloat(b.price) * 100).toFixed(1)}¢</span>
                      <span className="relative text-muted-foreground">{parseFloat(b.size).toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Asks */}
              <div>
                <div className="flex justify-between text-muted-foreground mb-1 px-1">
                  <span>Price</span><span>Size</span>
                </div>
                {topAsks.map((a, i) => {
                  const pct = (parseFloat(a.size) / maxBookSize) * 100;
                  return (
                    <div key={i} className="relative flex justify-between px-1 py-0.5 rounded-sm">
                      <div className="absolute inset-y-0 right-0 bg-no/8 rounded-sm" style={{ width: `${pct}%` }} />
                      <span className="relative text-no">{(parseFloat(a.price) * 100).toFixed(1)}¢</span>
                      <span className="relative text-muted-foreground">{parseFloat(a.size).toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5">Click a bid price to set as limit price</p>
          </div>
        )}

        {/* Order Type Toggle */}
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
          <button type="button" onClick={() => { setOrderMode("market"); setLimitPrice(""); }}
            className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
              orderMode === "market" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            Market
          </button>
          <button type="button" onClick={() => { setOrderMode("limit"); if (bestBid) setLimitPrice(bestBid.toFixed(2)); }}
            className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
              orderMode === "limit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            Limit
          </button>
        </div>

        {/* Limit Price Input */}
        {isLimitMode && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">
                Limit Price <span className="text-muted-foreground/60">(tick: {tickSize})</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={limitPrice}
                  onChange={(e) => { if (e.target.value === "" || /^\d*\.?\d{0,2}$/.test(e.target.value)) setLimitPrice(e.target.value); }}
                  onBlur={() => {
                    const p = parseFloat(limitPrice);
                    if (!isNaN(p) && p > 0) setLimitPrice(snapToTick(p, tickSize).toFixed(2));
                  }}
                  placeholder={bestBid ? bestBid.toFixed(2) : currentPrice.toFixed(2)}
                  className={cn(
                    "w-full rounded-md border bg-background pl-7 pr-16 py-2 text-sm font-mono focus:outline-none focus:ring-1",
                    limitPriceError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
                  )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button type="button" onClick={() => bestBid && setLimitPrice(bestBid.toFixed(2))}
                    disabled={!bestBid}
                    className="text-[9px] text-primary hover:text-primary/80 font-medium disabled:opacity-40">
                    Bid
                  </button>
                  <button type="button" onClick={() => currentPrice > 0 && setLimitPrice(snapToTick(currentPrice, tickSize).toFixed(2))}
                    className="text-[9px] text-primary hover:text-primary/80 font-medium">
                    Mkt
                  </button>
                </div>
              </div>
              {limitPriceError && <p className="text-[10px] text-destructive mt-0.5">{limitPriceError}</p>}
              {isLimitMode && !limitPriceError && parsedLimitPrice > 0 && currentPrice > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {parsedLimitPrice < currentPrice
                    ? `${((1 - parsedLimitPrice / currentPrice) * 100).toFixed(1)}% below market`
                    : parsedLimitPrice > currentPrice
                    ? `${((parsedLimitPrice / currentPrice - 1) * 100).toFixed(1)}% above market`
                    : "At market price"}
                </p>
              )}
            </div>

            {/* Time in Force */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Time in Force</label>
              <div className="flex gap-1">
                {TIF_OPTIONS.map((tif) => (
                  <button key={tif.id} type="button" onClick={() => setTimeInForce(tif.id)} title={tif.desc}
                    className={cn("flex-1 rounded-md py-1.5 text-[10px] font-semibold transition-all border",
                      timeInForce === tif.id
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-muted text-muted-foreground border-transparent hover:border-border"
                    )}>
                    {tif.label}
                  </button>
                ))}
              </div>
            </div>

            {timeInForce === "GTD" && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-mono">
                      {gtdDate ? format(gtdDate, "PPP") : "Select date"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={gtdDate} onSelect={setGtdDate} initialFocus />
                  </PopoverContent>
                </Popover>
                <input type="time" value={gtdTime} onChange={(e) => setGtdTime(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
              </div>
            )}
          </div>
        )}

        {/* Quantity selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Shares to sell</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={size}
                step={0.01}
                value={sharesToSell || ""}
                onChange={(e) => setSharesToSell(Math.min(size, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono text-right"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSharesToSell(size)}>
                Max
              </Button>
            </div>
          </div>
          <Slider
            value={[sharesToSell]}
            onValueChange={([v]) => setSharesToSell(Math.round(v * 100) / 100)}
            min={0} max={size} step={0.01} className="py-2"
          />
          <div className="flex gap-1.5">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <Button key={pct} variant="outline" size="sm" className="h-7 text-xs flex-1"
                onClick={() => setSharesToSell(Math.round(size * pct * 100) / 100)}>
                {pct === 1 ? "100%" : `${pct * 100}%`}
              </Button>
            ))}
          </div>
        </div>

        {/* Proceeds breakdown */}
        {sharesToSell > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {isLimitMode ? "Limit sell proceeds" : "Estimated proceeds"}
              </span>
              <span className="font-mono font-semibold">${estimatedProceeds.toFixed(2)}</span>
            </div>
            {isLimitMode && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Sell price</span>
                <span className="font-mono">{(effectivePrice * 100).toFixed(1)}¢ ({timeInForce})</span>
              </div>
            )}
            {feeEnabled && platformFee > 0 && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Platform fee ({PLATFORM_FEE_BPS / 100}%)</span>
                  <span className="font-mono text-muted-foreground">-${platformFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="font-medium">You receive</span>
                  <span className="font-mono font-bold">${netAmount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className={cn("flex justify-between text-xs pt-1", realizedPnl >= 0 ? "text-yes" : "text-no")}>
              <span className="flex items-center gap-1">
                {realizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                Realized P&L
              </span>
              <span className="font-mono font-semibold">
                {realizedPnl >= 0 ? "+" : ""}{realizedPnl.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Warning for full sell */}
        {sharesToSell === size && size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-[11px] text-warning">You are selling your entire position.</p>
          </div>
        )}

        {/* Existing open sell orders for this position */}
        {positionOrders.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Open Sell Orders ({positionOrders.length})</span>
            </div>
            <div className="space-y-1.5">
              {positionOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between text-xs bg-background rounded-md px-2 py-1.5 border border-border">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] h-4">{order.type}</Badge>
                    <span className="font-mono">{(parseFloat(order.price) * 100).toFixed(1)}¢</span>
                    <span className="text-muted-foreground">×</span>
                    <span className="font-mono">{parseFloat(order.original_size).toFixed(2)}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleCancelOrder(order.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sell button */}
        <Button
          onClick={handleSell}
          disabled={submitting || sharesToSell <= 0 || effectivePrice <= 0}
          className="w-full mt-2"
          variant="destructive"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stepLabel}
            </span>
          ) : sharesToSell > 0 ? (
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {isLimitMode ? "Place Limit Sell" : "Sell"} {sharesToSell.toFixed(2)} shares · ~${(feeEnabled ? netAmount : estimatedProceeds).toFixed(2)}
            </span>
          ) : (
            "Select shares to sell"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
