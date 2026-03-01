import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity, CheckCircle, XCircle, RefreshCw, Shield, AlertTriangle,
  Loader2, Wallet, Banknote, Copy, Info, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount, useSignTypedData } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { deriveApiCreds, checkUserCredsStatus, createDepositAddress, testUserCreds } from "@/lib/polymarket-api";
import { AuthGate } from "@/components/auth/AuthGate";
import { DepositAddressCard } from "@/components/polymarket/DepositAddressCard";
import { DepositStatusTracker } from "@/components/polymarket/DepositStatusTracker";

const TRADING_AGE_KEY = "polyview_trading_age_confirmed";

export default function PolymarketSettings() {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [credStatus, setCredStatus] = useState<{ hasCreds: boolean; address?: string; updatedAt?: string }>({ hasCreds: false });
  const [credLoading, setCredLoading] = useState(true);
  const [deriving, setDeriving] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(() => localStorage.getItem(TRADING_AGE_KEY) === "true");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [supabaseUser, setSupabaseUser] = useState<any>(null);
  const [depositError, setDepositError] = useState<any>(null);
  const [showDepositError, setShowDepositError] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [authTestResult, setAuthTestResult] = useState<{ valid: boolean; reason?: string } | null>(null);

  // Check Supabase auth state — attempt anonymous sign-in automatically
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSupabaseUser(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshCreds = useCallback(async () => {
    if (!supabaseUser) {
      setCredStatus({ hasCreds: false });
      setCredLoading(false);
      return;
    }
    setCredLoading(true);
    try {
      const status = await checkUserCredsStatus();
      setCredStatus(status);
    } catch {
      setCredStatus({ hasCreds: false });
    } finally {
      setCredLoading(false);
    }
  }, [supabaseUser]);

  useEffect(() => { refreshCreds(); }, [refreshCreds]);

  function handleAgeConfirm(checked: boolean) {
    setAgeConfirmed(checked);
    localStorage.setItem(TRADING_AGE_KEY, checked ? "true" : "false");
  }

  async function handleDerive() {
    if (!isConnected || !address) {
      toast({ title: "Connect your wallet first", variant: "destructive" });
      return;
    }
    if (!supabaseUser) {
      toast({ title: "Sign in to your account first", variant: "destructive" });
      return;
    }
    if (!ageConfirmed) {
      toast({ title: "Please confirm you are 18+ to enable trading", variant: "destructive" });
      return;
    }

    setDeriving(true);
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      // Use a unique nonce so Polymarket can mint a fresh API key when needed
      const nonce = Date.now().toString();
      const domain = { name: "ClobAuthDomain", version: "1", chainId: 137 } as const;
      const types = {
        ClobAuth: [
          { name: "address", type: "address" },
          { name: "timestamp", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "message", type: "string" },
        ],
      } as const;
      const message = {
        address: address,
        timestamp: timestamp,
        nonce: BigInt(nonce),
        message: "This message attests that I control the given wallet",
      } as const;

      const signature = await signTypedDataAsync({ account: address, domain, types, primaryType: "ClobAuth", message });
      const result = await deriveApiCreds({ address, signature, timestamp, nonce });

      if (result.ok) {
        toast({ title: "Trading Enabled!", description: "Your Polymarket API credentials have been securely derived and stored." });
        await refreshCreds();
      } else {
        toast({ title: "Derivation Failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      const msg = err.message || "Failed to sign typed data";
      if (msg.includes("rejected") || msg.includes("denied")) {
        toast({ title: "Signature rejected", description: "You cancelled the wallet signing request.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setDeriving(false);
    }
  }

  async function handleDeposit() {
    if (!address) return;
    setDepositLoading(true);
    setDepositError(null);
    try {
      const result = await createDepositAddress(address);
      if (result.ok) {
        setDepositInfo(result.deposit);
        toast({ title: "Deposit address retrieved" });
      } else {
        console.error("[PolyView] createDepositAddress failed:", result);
        setDepositError(result);
        const statusInfo = result.upstreamStatus ? ` (upstream ${result.upstreamStatus})` : "";
        toast({
          title: "Deposit address failed" + statusInfo,
          description: (result.error || "Unknown error"),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  }

  // Extract addresses from deposit response
  const depositAddresses = depositInfo?.address || depositInfo?.addresses || null;
  // Pick first available address for status tracking
  const trackingAddress = depositAddresses?.evm || depositAddresses?.svm || "";

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trading Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your wallet and derive your personal Polymarket API credentials to trade directly from PolyView.
          Your credentials are encrypted and stored per-account — no shared keys.
        </p>
      </div>

      {/* Age Confirmation */}
      <Card className="border-warning/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Age & Jurisdiction Confirmation
          </CardTitle>
          <CardDescription>
            You must be 18+ and in a jurisdiction where prediction market trading is permitted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <Checkbox
              id="age-confirm"
              checked={ageConfirmed}
              onCheckedChange={(checked) => handleAgeConfirm(checked === true)}
            />
            <label htmlFor="age-confirm" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
              I confirm I am at least 18 years old and located in a jurisdiction where prediction market
              trading is permitted. I understand this involves financial risk.
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Connection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Wallet
          </CardTitle>
          <CardDescription>Connect your Polygon wallet to enable trading.</CardDescription>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-mono">{address?.slice(0, 8)}…{address?.slice(-6)}</span>
              <ConnectButton.Custom>
                {({ openAccountModal }) => (
                  <Button variant="ghost" size="sm" onClick={openAccountModal}>Change</Button>
                )}
              </ConnectButton.Custom>
            </div>
          ) : (
            <ConnectButton />
          )}
        </CardContent>
      </Card>

      {/* Auth Status */}
      {!supabaseUser && (
        <AuthGate autoAnonymous={false}><></></AuthGate>
      )}

      {/* WalletConnect warning */}
      {!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID && (
        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/50 p-3">
          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            WalletConnect is disabled. Set <code className="font-mono text-[10px]">VITE_WALLETCONNECT_PROJECT_ID</code> to enable mobile wallets.
          </p>
        </div>
      )}

      <Separator />

      {/* Credential Derivation */}
      <Card className={credStatus.hasCreds ? "border-primary/30" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Trading Credentials</CardTitle>
            <Button variant="ghost" size="sm" onClick={refreshCreds} disabled={credLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${credLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <CardDescription>
            Derive your personal Polymarket API credentials by signing an EIP-712 message with your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {credLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking status...
            </div>
          ) : credStatus.hasCreds ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  <CheckCircle className="h-3 w-3 mr-1" /> Active
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Address: <span className="font-mono">{credStatus.address}</span></p>
                <p>Last updated: {credStatus.updatedAt ? new Date(credStatus.updatedAt).toLocaleString() : "—"}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleDerive} disabled={deriving || !isConnected || !supabaseUser || !ageConfirmed}>
                  {deriving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Re-derive Credentials
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={testingAuth}
                  onClick={async () => {
                    setTestingAuth(true);
                    setAuthTestResult(null);
                    try {
                      const result = await testUserCreds();
                      setAuthTestResult({ valid: result.valid, reason: result.reason });
                      if (result.valid) {
                        toast({ title: "Authentication OK", description: "Your Polymarket credentials are valid and working." });
                      } else if (result.deleted) {
                        toast({ title: "Credentials expired", description: "Stale credentials were removed. Please re-derive.", variant: "destructive" });
                        await refreshCreds();
                      } else {
                        toast({ title: "Authentication failed", description: result.reason || "Credentials are invalid. Try re-deriving.", variant: "destructive" });
                      }
                    } catch (err: any) {
                      setAuthTestResult({ valid: false, reason: err.message });
                      toast({ title: "Test failed", description: err.message, variant: "destructive" });
                    } finally {
                      setTestingAuth(false);
                    }
                  }}
                >
                  {testingAuth ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                  Test Authentication
                </Button>
              </div>
              {authTestResult && (
                <div className={`rounded-md border p-3 text-xs ${authTestResult.valid ? "border-primary/30 bg-primary/5 text-primary" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                  {authTestResult.valid ? (
                    <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> Polymarket CLOB authentication successful</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" /> Auth failed{authTestResult.reason ? `: ${authTestResult.reason}` : ". Re-derive your credentials."}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No credentials stored yet. Click below to sign with your wallet and derive your Polymarket API key.
              </p>
              <Button onClick={handleDerive} disabled={deriving || !isConnected || !supabaseUser || !ageConfirmed} className="w-full sm:w-auto">
                {deriving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                {deriving ? "Signing & Deriving..." : "Enable Trading"}
              </Button>
              {!ageConfirmed && <p className="text-xs text-warning">⚠️ Confirm age & jurisdiction above first</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fund Account / Deposit */}
      {credStatus.hasCreds && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Fund Account
            </CardTitle>
            <CardDescription>
              Deposit funds to your Polymarket account. Bridge converts deposits to USDC.e on Polygon automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* How deposits work */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground gap-1">
                  <Info className="h-3.5 w-3.5" /> How deposits work <ChevronDown className="h-3 w-3" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/30 p-3 space-y-2 text-xs text-muted-foreground">
                <p>• Polymarket uses <strong>USDC.e on Polygon</strong> as collateral for all trades.</p>
                <p>• Bridge deposits from other chains (Ethereum, Solana, Bitcoin, Tron) are <strong>converted automatically</strong>.</p>
                <p>• Check minimum deposit amounts and supported assets before sending.</p>
                <p>• Track deposit progress using the status checker below.</p>
              </CollapsibleContent>
            </Collapsible>

            {/* Get deposit address button */}
            {!depositAddresses && (
              <Button variant="secondary" onClick={handleDeposit} disabled={depositLoading || !address} className="w-full sm:w-auto">
                {depositLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
                {depositLoading ? "Loading..." : "Get Deposit Address"}
              </Button>
            )}

            {/* Error display */}
            {depositError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-xs text-destructive">
                  {depositError.error || "Failed to get deposit address"}
                  {depositError.upstreamStatus ? ` (status ${depositError.upstreamStatus})` : ""}
                </p>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowDepositError(!showDepositError)}>
                  {showDepositError ? "Hide" : "Show"} Details
                </Button>
                {showDepositError && (
                  <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(depositError, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Deposit address card with chain selector + QR */}
            {depositAddresses && (
              <>
                <DepositAddressCard
                  addresses={depositAddresses}
                  note={depositInfo?.note}
                />
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Deposit Status</h3>
                  <p className="text-xs text-muted-foreground">Track incoming deposits by checking the status of your deposit address.</p>
                  <DepositStatusTracker address={trackingAddress} />
                </div>
                <Button variant="outline" size="sm" onClick={handleDeposit} disabled={depositLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${depositLoading ? "animate-spin" : ""}`} /> Refresh Address
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Security Info */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-muted-foreground">Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>✅ Your Polymarket API credentials are derived from your wallet signature — never pasted or typed.</p>
          <p>✅ Credentials are encrypted with AES-256-GCM and stored per-user. No global/shared secrets.</p>
          <p>✅ All L2 HMAC signing happens server-side. Your API secret never reaches the browser.</p>
          <p>✅ Orders are signed by your wallet (client-side) and submitted by our backend with L2 headers.</p>
          <p>✅ Geoblock checks are performed before every order submission.</p>
        </CardContent>
      </Card>
    </div>
  );
}
