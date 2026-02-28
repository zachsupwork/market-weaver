import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, Plus, Copy, Check, AlertTriangle, Eye, EyeOff, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

interface ApiKeyDisplay {
  apiKey: string;
  secret: string;
  passphrase: string;
  createdAt: string;
}

export default function BuilderKeys() {
  const { isConnected, address } = useAccount();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyDisplay[]>([]);
  const [newKey, setNewKey] = useState<ApiKeyDisplay | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyField(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast({ title: `${field} copied` });
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleCreateKey() {
    // For now, display info about generating keys through the enable trading flow
    toast({
      title: "API Keys",
      description: "Your API keys are generated when you enable trading (Step 2 in the trading setup). They are securely stored and used automatically.",
    });
  }

  if (!isConnected) {
    return (
      <div className="container max-w-3xl py-16 text-center">
        <Key className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Builder API Keys</h1>
        <p className="text-sm text-muted-foreground mb-6">Connect your wallet to manage API keys</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Builder API Keys</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your Polymarket CLOB API credentials for programmatic trading.
        </p>
      </div>

      {/* Security Warning */}
      <Alert className="border-warning/30 bg-warning/5">
        <Shield className="h-4 w-4 text-warning" />
        <AlertDescription className="text-xs text-warning">
          Your API keys are encrypted and stored securely. They are derived from your wallet
          signature and never exposed in plaintext. All signing happens server-side.
        </AlertDescription>
      </Alert>

      {/* Current Keys */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" /> Your API Keys
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleCreateKey} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create New
            </Button>
          </div>
          <CardDescription>
            Keys are auto-generated when you enable trading. They're used for CLOB order submission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">Active</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSecrets(!showSecrets)}
                className="gap-1.5 h-7 text-xs"
              >
                {showSecrets ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showSecrets ? "Hide" : "Show"}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">API Key</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {showSecrets ? "••••••••-managed-by-server" : "••••••••••••"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Secret</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {showSecrets ? "••••••••-encrypted-at-rest" : "••••••••••••"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Passphrase</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {showSecrets ? "••••••••-never-exposed" : "••••••••••••"}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground mt-2">
              Wallet: <span className="font-mono">{address?.slice(0, 8)}…{address?.slice(-6)}</span>
            </p>
          </div>

          {/* New Key Warning */}
          {newKey && (
            <Alert className="border-destructive/30 bg-destructive/5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-xs">
                <strong className="text-destructive">Save these keys now — you won't be able to see them again!</strong>
                <br />
                Never share your key or secret with anyone. Do not commit them to source control.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-muted-foreground">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>✅ API keys are derived from your EIP-712 wallet signature — no manual input needed.</p>
          <p>✅ Keys are encrypted with AES-256-GCM and stored per-user in our backend.</p>
          <p>✅ All CLOB requests are signed server-side with HMAC-SHA256. Your secret never leaves the server.</p>
          <p>✅ Re-deriving credentials will rotate your keys automatically.</p>
        </CardContent>
      </Card>
    </div>
  );
}
