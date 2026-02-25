import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Activity, CheckCircle, XCircle, RefreshCw, Key, Shield, AlertTriangle, Loader2, Github, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Status = "idle" | "loading" | "success" | "error";

interface CredStatus {
  hasCreds: boolean;
  updatedAt: string | null;
  credType: "placeholder" | "real" | "unknown" | null;
}

export default function PolymarketSettings() {
  const { toast } = useToast();
  const [backendStatus, setBackendStatus] = useState<Status>("idle");
  const [credStatus, setCredStatus] = useState<CredStatus>({ hasCreds: false, updatedAt: null, credType: null });
  const [credStatusLoading, setCredStatusLoading] = useState(true);
  const [deriving, setDeriving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; placeholder?: boolean; message?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState({ apiKey: "", secret: "", passphrase: "", address: "" });

  const checkHealth = useCallback(async () => {
    setBackendStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-health");
      if (error) throw error;
      setBackendStatus(data?.ok ? "success" : "error");
    } catch {
      setBackendStatus("error");
    }
  }, []);

  const checkCreds = useCallback(async () => {
    setCredStatusLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-has-creds");
      if (error) throw error;
      setCredStatus({
        hasCreds: data?.hasCreds ?? false,
        updatedAt: data?.updatedAt ?? null,
        credType: data?.credType ?? null,
      });
    } catch {
      setCredStatus({ hasCreds: false, updatedAt: null, credType: null });
    } finally {
      setCredStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    checkCreds();
  }, [checkHealth, checkCreds]);

  const derivePlaceholder = async () => {
    setDeriving(true);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-derive-creds", {
        method: "POST",
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to generate placeholder credentials");
      toast({ title: "Placeholder Credentials Stored", description: `Created at ${data.createdAt}. These are for storage testing only.` });
      await checkCreds();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeriving(false);
    }
  };

  const testAuth = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-test-auth", {
        method: "POST",
      });
      if (error) throw error;
      setTestResult({ ok: data?.ok ?? false, error: data?.error, placeholder: data?.placeholder, message: data?.message });
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const importCreds = async () => {
    if (!importForm.apiKey || !importForm.secret || !importForm.passphrase) {
      toast({ title: "Missing fields", description: "API Key, Secret, and Passphrase are required.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-import-creds", {
        method: "POST",
        body: importForm,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Import failed");
      toast({ title: "Real Credentials Imported", description: "Encrypted and stored successfully. Run Test Auth to verify." });
      setImportForm({ apiKey: "", secret: "", passphrase: "", address: "" });
      setTestResult(null);
      await checkCreds();
    } catch (err: any) {
      toast({ title: "Import Error", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const credBadge = () => {
    if (!credStatus.hasCreds) return <Badge variant="secondary">None</Badge>;
    if (credStatus.credType === "real") {
      return <Badge className="bg-primary/20 text-primary border-primary/30"><Shield className="h-3 w-3 mr-1" /> Real</Badge>;
    }
    if (credStatus.credType === "placeholder") {
      return <Badge variant="outline" className="border-accent text-accent-foreground"><AlertTriangle className="h-3 w-3 mr-1" /> Placeholder</Badge>;
    }
    return <Badge variant="secondary">Unknown</Badge>;
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Polymarket API Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your server-side Polymarket CLOB API credentials. Private keys never leave the backend.
        </p>
      </div>

      {/* Connectivity Check */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Connectivity Check</CardTitle>
            <Button variant="ghost" size="sm" onClick={checkHealth}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
          <CardDescription>Verify that the backend functions are reachable.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {backendStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {backendStatus === "success" && <CheckCircle className="h-4 w-4 text-primary" />}
            {backendStatus === "error" && <XCircle className="h-4 w-4 text-destructive" />}
            {backendStatus === "idle" && <Activity className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm">
              {backendStatus === "loading" && "Checking..."}
              {backendStatus === "success" && "Backend is reachable"}
              {backendStatus === "error" && "Backend unreachable — check edge function deployment"}
              {backendStatus === "idle" && "Not checked yet"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Status Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Credential Status</CardTitle>
          <CardDescription>Current state of stored Polymarket API credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {credStatusLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading status...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-36">Credentials:</span>
                {credBadge()}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-36">Last updated:</span>
                <span className="text-sm font-mono">
                  {credStatus.updatedAt
                    ? new Date(credStatus.updatedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
              {credStatus.credType === "placeholder" && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  ⚠️ Placeholder credentials are stored for testing the encryption/storage flow only.
                  They will not authenticate against the Polymarket CLOB API.
                  Use one of the methods below to store real credentials.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Generate Real Credentials (Recommended) */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Github className="h-4 w-4" /> Generate Real Credentials (Recommended)
          </CardTitle>
          <CardDescription>
            Use the GitHub Actions workflow to derive real Polymarket L2 CLOB API credentials without any local setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm space-y-2">
            <p className="font-medium">Steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to your GitHub repo → <strong>Actions</strong> → <strong>"Derive Polymarket API Credentials"</strong></li>
              <li>Click <strong>"Run workflow"</strong></li>
              <li>The workflow reads your GitHub Secrets, derives real L1-signed credentials, encrypts them, and stores them in the database</li>
              <li>Come back here and click <strong>Test Auth</strong> to verify</li>
            </ol>
            <p className="font-medium mt-3">Required GitHub Secrets:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5 font-mono text-xs">
              <li>PM_PRIVATE_KEY — Your Polymarket wallet private key</li>
              <li>MASTER_KEY — AES-256-GCM encryption key (same as backend)</li>
              <li>SUPABASE_URL — Your project's backend URL</li>
              <li>SUPABASE_SERVICE_ROLE_KEY — Service role key for database access</li>
              <li>CHAIN_ID — (optional, default: 137)</li>
              <li>CLOB_HOST — (optional, default: https://clob.polymarket.com)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Import Real Credentials */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import Real Credentials
          </CardTitle>
          <CardDescription>
            Paste real Polymarket CLOB API credentials derived externally (via L1 wallet signature or @polymarket/clob-client).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Input
              placeholder="API Key"
              value={importForm.apiKey}
              onChange={(e) => setImportForm(f => ({ ...f, apiKey: e.target.value }))}
            />
            <Input
              placeholder="Secret (base64)"
              type="password"
              value={importForm.secret}
              onChange={(e) => setImportForm(f => ({ ...f, secret: e.target.value }))}
            />
            <Input
              placeholder="Passphrase"
              type="password"
              value={importForm.passphrase}
              onChange={(e) => setImportForm(f => ({ ...f, passphrase: e.target.value }))}
            />
            <Input
              placeholder="Wallet address (optional)"
              value={importForm.address}
              onChange={(e) => setImportForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>
          <Button onClick={importCreds} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {importing ? "Importing..." : "Import Credentials"}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Test Authentication */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Test Authentication</CardTitle>
          <CardDescription>
            Verify stored credentials work against the Polymarket CLOB API using HMAC-SHA256 signing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="secondary" onClick={testAuth} disabled={testing || !credStatus.hasCreds}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
            {testing ? "Testing..." : "Test Auth"}
          </Button>
          {testResult && (
            <div className={`flex items-start gap-2 text-sm rounded p-3 ${
              testResult.ok
                ? "bg-primary/10 text-primary"
                : testResult.placeholder
                  ? "bg-accent/10 text-accent-foreground"
                  : "bg-destructive/10 text-destructive"
            }`}>
              {testResult.ok ? (
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : testResult.placeholder ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{testResult.ok ? (testResult.message || "Authentication successful") : testResult.error || "Authentication failed"}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Storage Test — Placeholder */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <Key className="h-4 w-4" /> Generate Placeholder Credentials (Storage Test Only)
          </CardTitle>
          <CardDescription>
            Store fake credentials to verify the encryption/storage pipeline works. These will <strong>not</strong> authenticate with Polymarket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={deriving} className="text-muted-foreground">
                {deriving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                {deriving ? "Generating..." : "Generate Placeholder Credentials"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generate Placeholder Credentials?</AlertDialogTitle>
                <AlertDialogDescription>
                  This stores <strong>fake</strong> credentials to test the encryption/storage pipeline.
                  If you have real credentials stored, they will be overwritten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={derivePlaceholder}>Yes, Generate Placeholders</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
