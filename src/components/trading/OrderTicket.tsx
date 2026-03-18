import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { checkUserCredsStatus, postSignedOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { Loader2, Wallet, Shield, ChevronDown, ChevronUp, AlertTriangle, Check, Minus, Plus, Copy, ArrowRightLeft, ExternalLink, Calendar as CalendarIcon } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTradingReadiness } from "@/hooks/useTradingReadiness";
import { TradingEnablement } from "@/components/trading/TradingEnablement";
import { supabase } from "@/integrations/supabase/client";
import { ClobClient, Side as ClobSide } from "@polymarket/clob-client";
import { ethers } from "ethers";
import { useProxyWallet } from "@/hooks/useProxyWallet";
import { USDC_TO_USDC_E_SWAP_URL } from "@/lib/tokens";
import { calculatePlatformFee, isFeeEnabled, FEE_WALLET_ADDRESS, ERC20_TRANSFER_ABI, PLATFORM_FEE_BPS } from "@/lib/platform-fee";
import { POLYGON_USDCE_ADDRESS } from "@/lib/constants/tokens";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

export type TradeAction = "BUY_YES" | "BUY_NO" | "SELL_YES" | "SELL_NO";
type OrderMode = "market" | "limit";
type TimeInForce = "GTC" | "GTD" | "FOK" | "FAK";

interface OrderTicketProps {
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number | null;
  noPrice: number | null;
  conditionId?: string;
  isTradable?: boolean;
  initialAction?: TradeAction;
  yesPositionSize?: number;
  noPositionSize?: number;
  tickSize?: number;
}

const TRADING_AGE_KEY = "polyview_trading_age_confirmed";

const ACTION_LABELS: Record<TradeAction, { label: string; side: "BUY" | "SELL"; outcome: "Yes" | "No" }> = {
  BUY_YES:  { label: "Buy Yes",  side: "BUY",  outcome: "Yes" },
  BUY_NO:   { label: "Buy No",   side: "BUY",  outcome: "No" },
  SELL_YES:  { label: "Sell Yes",  side: "SELL", outcome: "Yes" },
  SELL_NO:   { label: "Sell No",   side: "SELL", outcome: "No" },
};

const TIF_OPTIONS: { id: TimeInForce; label: string; description: string }[] = [
  { id: "GTC", label: "GTC", description: "Good Till Cancel" },
  { id: "GTD", label: "GTD", description: "Good Till Date" },
  { id: "FOK", label: "FOK", description: "Fill or Kill" },
  { id: "FAK", label: "FAK", description: "Fill & Kill" },
];

function validateTickSize(price: number, tickSize: number): boolean {
  if (tickSize <= 0) return true;
  const remainder = Math.abs((price * 100) % (tickSize * 100));
  return remainder < 0.001 || Math.abs(remainder - tickSize * 100) < 0.001;
}

function snapToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

function formatPriceBadge(price: number | null) {
  return price != null ? `${Math.round(price * 100)}¢` : "—";
}

export function OrderTicket({
  yesTokenId,
  noTokenId,
  yesPrice,
  noPrice,
  conditionId,
  isTradable = true,
  initialAction = "BUY_YES",
  yesPositionSize = 0,
  noPositionSize = 0,
  tickSize = 0.01,
}: OrderTicketProps) {
  const [action, setAction] = useState<TradeAction>(initialAction);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
  const [gtdDate, setGtdDate] = useState<Date | undefined>();
  const [gtdTime, setGtdTime] = useState("23:59");

  const { isConnected, address, chainId } = useAccount();
  const { proxyAddress } = useProxyWallet();
  const { switchChain } = useSwitchChain();
  const isPolygon = chainId === 137;

  const { side, outcome } = ACTION_LABELS[action];
  const isBuy = side === "BUY";
  const isYes = outcome === "Yes";
  const tokenId = isYes ? yesTokenId : noTokenId;
  const marketPrice = isYes ? yesPrice : noPrice;
  const hasMarketPrice = marketPrice != null && marketPrice > 0;

  const parsedLimitPrice = parseFloat(limitPrice);
  const isLimitMode = orderMode === "limit";
  const effectivePrice = isLimitMode && !isNaN(parsedLimitPrice) && parsedLimitPrice > 0
    ? parsedLimitPrice
    : marketPrice ?? 0;

  const availableShares = isYes ? yesPositionSize : noPositionSize;

  const readiness = useTradingReadiness(isBuy ? amount : 0);

  const shares = useMemo(() => effectivePrice > 0 ? amount / effectivePrice : 0, [amount, effectivePrice]);
  const { fee: platformFee, netAmount } = useMemo(() => calculatePlatformFee(amount), [amount]);
  const feeEnabled = isFeeEnabled();
  const potentialPayout = shares;
  const potentialProfit = isBuy ? potentialPayout - amount : shares * effectivePrice;
  const returnPct = amount > 0 && isBuy ? ((potentialPayout / amount) - 1) * 100 : 0;

  const hasInsufficientBalance = isBuy && amount > readiness.usdc.usdcBalance;
  const hasInsufficientShares = !isBuy && shares > availableShares;
  const hasNativeUsdcButNoE = readiness.usdc.usdcNativeBalance > 0 && readiness.usdc.usdcBalance < amount;
  const ageConfirmed = localStorage.getItem(TRADING_AGE_KEY) === "true";

  const limitPriceError = useMemo(() => {
    if (!isLimitMode || !limitPrice) return null;
    const p = parseFloat(limitPrice);
    if (isNaN(p)) return "Invalid price";
    if (p <= 0) return "Price must be positive";
    if (p >= 1) return "Price must be less than $1.00";
    if (p < tickSize) return `Min price: ${tickSize}`;
    if (p > 1 - tickSize) return `Max price: ${(1 - tickSize).toFixed(2)}`;
    if (!validateTickSize(p, tickSize)) return `Must be multiple of ${tickSize}`;
    return null;
  }, [isLimitMode, limitPrice, tickSize]);

  const gtdExpiration = useMemo(() => {
    if (timeInForce !== "GTD" || !gtdDate) return 0;
    const [h, m] = gtdTime.split(":").map(Number);
    const d = new Date(gtdDate);
    d.setHours(h || 0, m || 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [timeInForce, gtdDate, gtdTime]);

  const quickAmounts = isBuy ? [1, 5, 10, 100] : [1, 5, 10];

  const canSellYes = yesPositionSize > 0;
  const canSellNo = noPositionSize > 0;

  function adjustAmount(delta: number) {
    setAmount((prev) => Math.max(0, Math.round((prev + delta) * 100) / 100));
    setShowConfirm(false);
  }

  function switchAction(newAction: TradeAction) {
    setAction(newAction);
    setAmount(0);
    setShowConfirm(false);
  }

  function handleLimitPriceChange(val: string) {
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setLimitPrice(val);
      setShowConfirm(false);
    }
  }

  function handleSnapPrice() {
    const p = parseFloat(limitPrice);
    if (!isNaN(p) && p > 0) {
      const snapped = snapToTick(p, tickSize);
      const clamped = Math.max(tickSize, Math.min(1 - tickSize, snapped));
      setLimitPrice(clamped.toFixed(2));
    }
  }

  const handleModeSwitch = useCallback((mode: OrderMode) => {
    setOrderMode(mode);
    if (mode === "market") {
      setLimitPrice("");
      setTimeInForce("GTC");
    } else {
      setLimitPrice(hasMarketPrice ? (marketPrice as number).toFixed(2) : "");
    }
    setShowConfirm(false);
  }, [hasMarketPrice, marketPrice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) { toast.error("Connect your wallet first"); return; }
    if (!isTradable || !hasMarketPrice) { toast.error("Live market prices are still loading"); return; }
    if (!ageConfirmed) { toast.error("Confirm age & jurisdiction in Settings"); return; }
    if (!readiness.allReady) { toast.error("Complete all setup steps below before trading"); return; }
    if (amount <= 0) { toast.error("Enter an amount"); return; }

    if (isLimitMode) {
      if (!limitPrice || isNaN(parsedLimitPrice) || parsedLimitPrice <= 0) {
        toast.error("Enter a valid limit price"); return;
      }
      if (limitPriceError) {
        toast.error(limitPriceError); return;
      }
      if (timeInForce === "GTD" && (!gtdDate || gtdExpiration <= Math.floor(Date.now() / 1000))) {
        toast.error("Select a future expiration date/time for GTD orders"); return;
      }
    }

    if (isBuy && hasInsufficientBalance) {
      if (hasNativeUsdcButNoE) {
        toast.error(`You have $${readiness.usdc.usdcNativeBalance.toFixed(2)} USDC but trading requires USDC.e. Convert USDC → USDC.e first.`);
      } else {
        toast.error(`Not enough USDC.e. You have $${readiness.usdc.usdcBalance.toFixed(2)} USDC.e on Polygon.`);
      }
      return;
    }

    if (!isBuy && hasInsufficientShares) {
      toast.error(`Not enough ${outcome} shares. You have ${availableShares.toFixed(2)} shares available to sell.`);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please sign in first to place orders");
      return;
    }

    if (!showConfirm) { setShowConfirm(true); return; }

    setSubmitting(true);
    try {
      let feeTxHash: string | null = null;
      if (feeEnabled && platformFee > 0) {
        try {
          toast.info(`Requesting platform fee transfer ($${platformFee.toFixed(2)})…`);
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
              user_address: address?.toLowerCase() ?? "",
              order_condition_id: conditionId ?? null,
              fee_amount: platformFee,
              fee_bps: PLATFORM_FEE_BPS,
              tx_hash: feeTxHash,
            } as any);
          } catch (dbErr) {
            console.warn("[OrderTicket] Failed to record fee:", dbErr);
          }
        } catch (feeErr: any) {
          if (feeErr?.code === 4001 || feeErr?.code === "ACTION_REJECTED") {
            toast.error("Fee transfer rejected. Order cancelled.");
          } else {
            toast.error(`Fee transfer failed: ${feeErr.message}`);
          }
          setSubmitting(false);
          return;
        }
      }

      const credsStatus = await checkUserCredsStatus();
      if (!credsStatus.hasCreds || !credsStatus.address) {
        toast.error("Trading credentials missing. Re-enable trading in Setup below.");
        await readiness.refreshCreds();
        return;
      }

      if (!(window as any).ethereum) {
        throw new Error("Wallet provider not found");
      }

      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      const signer = provider.getSigner();

      const useProxy = !!proxyAddress;
      const clobClient = new ClobClient(
        "https://clob.polymarket.com",
        137,
        signer,
        undefined,
        useProxy ? 2 : 0,
        useProxy ? proxyAddress : undefined,
      );

      const eoaAddr = (await signer.getAddress()).toLowerCase();
      const orderExpiration = timeInForce === "GTD" ? gtdExpiration : 0;
      const effectiveOrderType = isLimitMode ? timeInForce : "GTC";

      console.log("[OrderTicket] Creating order:", {
        action,
        mode: orderMode,
        signerAddress: eoaAddr,
        tokenId,
        side,
        price: effectivePrice,
        size: Number(shares.toFixed(6)),
        orderType: effectiveOrderType,
        expiration: orderExpiration,
      });

      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        side: side === "BUY" ? ClobSide.BUY : ClobSide.SELL,
        price: effectivePrice,
        size: Number(shares.toFixed(6)),
        feeRateBps: 0,
        expiration: orderExpiration,
      });

      const orderSigner = ((signedOrder as any)?.order?.signer ?? (signedOrder as any)?.signer ?? "").toLowerCase();
      if (orderSigner && orderSigner !== eoaAddr) {
        throw new Error(`Signer mismatch: order signed by ${orderSigner} but your wallet is ${eoaAddr}. Re-enable trading with the same wallet.`);
      }

      const result = await postSignedOrder(signedOrder, effectiveOrderType);

      if (result.ok) {
        const modeLabel = isLimitMode ? "Limit" : "Market";
        toast.success(`${modeLabel} ${ACTION_LABELS[action].label} order placed — $${amount.toFixed(2)}${isLimitMode ? ` @ ${effectivePrice.toFixed(2)}` : ""}`);
        setAmount(0);
        setShowConfirm(false);
      } else {
        const errMsg = result.error || "Order failed";
        const errLower = errMsg.toLowerCase();
        const isAuthError = result.code === "GEOBLOCKED" || result.code === "NO_CREDS" || result.code === "INVALID_API_KEY"
          || errLower.includes("expired") || errLower.includes("unauthorized") || errLower.includes("invalid api key")
          || errLower.includes("signature") || errLower.includes("api credentials");

        if (isAuthError) {
          toast.error("Trading auth expired. Re-enable trading in Setup below.");
          await readiness.refreshCreds();
        } else {
          toast.error(errMsg);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-1 mb-4">
        <button type="button" onClick={() => switchAction("BUY_YES")}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "BUY_YES" ? "bg-yes/20 text-yes border border-yes/40" : "bg-muted text-muted-foreground border border-transparent hover:border-border"
          )}>
          Buy Yes <span className="font-mono ml-1">{formatPriceBadge(yesPrice)}</span>
        </button>
        <button type="button" onClick={() => switchAction("BUY_NO")}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "BUY_NO" ? "bg-no/20 text-no border border-no/40" : "bg-muted text-muted-foreground border border-transparent hover:border-border"
          )}>
          Buy No <span className="font-mono ml-1">{formatPriceBadge(noPrice)}</span>
        </button>
        <button type="button" onClick={() => switchAction("SELL_YES")}
          disabled={!canSellYes}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "SELL_YES" ? "bg-yes/10 text-yes border border-yes/30" : "bg-muted text-muted-foreground border border-transparent hover:border-border",
            !canSellYes && "opacity-40 cursor-not-allowed"
          )}>
          Sell Yes {canSellYes && <span className="font-mono ml-1">({yesPositionSize.toFixed(1)})</span>}
        </button>
        <button type="button" onClick={() => switchAction("SELL_NO")}
          disabled={!canSellNo}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "SELL_NO" ? "bg-no/10 text-no border border-no/30" : "bg-muted text-muted-foreground border border-transparent hover:border-border",
            !canSellNo && "opacity-40 cursor-not-allowed"
          )}>
          Sell No {canSellNo && <span className="font-mono ml-1">({noPositionSize.toFixed(1)})</span>}
        </button>
      </div>

      <h3 className="text-sm font-semibold mb-3">
        {ACTION_LABELS[action].label}{" "}
        <span className={isYes ? "text-yes" : "text-no"}>{outcome}</span>
      </h3>

      <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-muted">
        <button
          type="button"
          onClick={() => handleModeSwitch("market")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            orderMode === "market"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Market
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch("limit")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            orderMode === "limit"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Limit
        </button>
      </div>

      {isLimitMode && (
        <div className="mb-3 space-y-2">
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
                onChange={(e) => handleLimitPriceChange(e.target.value)}
                onBlur={handleSnapPrice}
                placeholder={hasMarketPrice ? (marketPrice as number).toFixed(2) : "Loading…"}
                className={cn(
                  "w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-1",
                  limitPriceError
                    ? "border-destructive focus:ring-destructive"
                    : "border-input focus:ring-ring"
                )}
              />
              <button
                type="button"
                onClick={() => hasMarketPrice && setLimitPrice((marketPrice as number).toFixed(2))}
                disabled={!hasMarketPrice}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-primary hover:text-primary/80 font-medium disabled:opacity-40"
              >
                Mkt
              </button>
            </div>
            {limitPriceError && (
              <p className="text-[10px] text-destructive mt-0.5">{limitPriceError}</p>
            )}
            {isLimitMode && !limitPriceError && parsedLimitPrice > 0 && hasMarketPrice && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {parsedLimitPrice < (marketPrice as number)
                  ? `${((1 - parsedLimitPrice / (marketPrice as number)) * 100).toFixed(1)}% below market`
                  : parsedLimitPrice > (marketPrice as number)
                  ? `${((parsedLimitPrice / (marketPrice as number) - 1) * 100).toFixed(1)}% above market`
                  : "At market price"}
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Time in Force</label>
            <div className="flex gap-1">
              {TIF_OPTIONS.map((tif) => (
                <button
                  key={tif.id}
                  type="button"
                  onClick={() => setTimeInForce(tif.id)}
                  title={tif.description}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-[10px] font-semibold transition-all border",
                    timeInForce === tif.id
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  )}
                >
                  {tif.label}
                </button>
              ))}
            </div>
          </div>

          {timeInForce === "GTD" && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-mono text-foreground"
                  >
                    {gtdDate ? format(gtdDate, "PPP") : "Select date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={gtdDate} onSelect={setGtdDate} initialFocus />
                </PopoverContent>
              </Popover>
              <input
                type="time"
                value={gtdTime}
                onChange={(e) => setGtdTime(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground"
              />
            </div>
          )}
        </div>
      )}

      <div className="mb-4 space-y-2">
        <label className="text-xs text-muted-foreground">Amount</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => adjustAmount(-1)} className="rounded-md border border-border p-2 hover:bg-accent transition-all">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount || ""}
            onChange={(e) => {
              setAmount(Number(e.target.value));
              setShowConfirm(false);
            }}
            placeholder="0.00"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button type="button" onClick={() => adjustAmount(1)} className="rounded-md border border-border p-2 hover:bg-accent transition-all">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {quickAmounts.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setAmount(value);
                setShowConfirm(false);
              }}
              className="rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
            >
              ${value}
            </button>
          ))}
        </div>
      </div>

      {!hasMarketPrice && (
        <div className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Waiting for live market prices before trading.
        </div>
      )}

      {amount > 0 && (
        <div className="space-y-1 mb-3 px-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Action</span>
            <span className={cn("font-semibold", isYes ? "text-yes" : "text-no")}>{ACTION_LABELS[action].label}</span>
          </div>
          {isLimitMode && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Order Type</span>
              <span className="font-mono text-foreground">Limit ({timeInForce})</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Price</span>
            <span className="font-mono text-foreground">
              {effectivePrice > 0 ? `${Math.round(effectivePrice * 100)}¢` : "—"}
              {isLimitMode && hasMarketPrice && effectivePrice !== marketPrice && (
                <span className="text-muted-foreground ml-1">(mkt: {Math.round((marketPrice as number) * 100)}¢)</span>
              )}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. Shares</span>
            <span className="font-mono text-foreground">{shares.toFixed(2)}</span>
          </div>
          {isBuy ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Payout if {outcome}</span>
                <span className="font-mono text-foreground">${potentialPayout.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Potential Profit</span>
                <span className="font-mono text-yes">+${potentialProfit.toFixed(2)} ({returnPct > 0 ? `+${returnPct.toFixed(0)}%` : "0%"})</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Est. Proceeds</span>
              <span className="font-mono text-yes">+${potentialProfit.toFixed(2)}</span>
            </div>
          )}
          {feeEnabled && platformFee > 0 && isBuy && (
            <>
              <div className="border-t border-border my-1" />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Platform Fee ({(PLATFORM_FEE_BPS / 100).toFixed(1)}%)</span>
                <span className="font-mono text-warning">${platformFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Net to Market</span>
                <span className="font-mono text-foreground">${netAmount.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !isTradable || !hasMarketPrice || (!isConnected && isBuy)}
        className={cn(
          "w-full rounded-md py-2.5 text-sm font-semibold transition-all",
          isYes ? "bg-yes text-yes-foreground hover:bg-yes/90" : "bg-no text-no-foreground hover:bg-no/90",
          (submitting || !isTradable || !hasMarketPrice) && "opacity-50 cursor-not-allowed"
        )}
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Placing Order...</span>
        ) : !hasMarketPrice ? (
          "Waiting for live price"
        ) : showConfirm ? (
          `Confirm ${ACTION_LABELS[action].label}`
        ) : (
          ACTION_LABELS[action].label
        )}
      </button>

      {!isConnected && (
        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4 text-center">
          <Wallet className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-xs text-muted-foreground mb-3">Connect your wallet to trade</p>
          <div className="flex justify-center"><ConnectButton /></div>
        </div>
      )}

      {!isPolygon && isConnected && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
            <div>
              <p className="font-semibold text-foreground">Switch to Polygon</p>
              <p className="text-muted-foreground mt-0.5">Polymarket trading requires the Polygon network.</p>
              <button
                type="button"
                onClick={() => switchChain({ chainId: 137 })}
                className="mt-2 inline-flex rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground"
              >
                Switch Network
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <TradingEnablement compact={false} />
      </div>
    </form>
  );
}
