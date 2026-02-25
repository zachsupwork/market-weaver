import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, CheckCircle, XCircle, RefreshCw, Key, Shield, AlertTriangle, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Status = "idle" | "loading" | "success" | "error";

interface CredStatus {
  hasCreds: boolean;
  updatedAt: string | null;
}

export default function PolymarketSettings() {
  const { toast } = useToast();
  const [backendStatus, setBackendStatus] = useState<Status>("idle");
  const [credStatus, setCredStatus] = useState<CredStatus>({ hasCreds: false, updatedAt: null });
  const [credStatusLoading, setCredStatusLoading] = useState(true);
  const [deriving, setDeriving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState({ apiKey: "", secret: "", passphrase: "" });

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
      setCredStatus({ hasCreds: data?.hasCreds ?? false, updatedAt: data?.updatedAt ?? null });
    } catch {
      setCredStatus({ hasCreds: false, updatedAt: null });
    } finally {
      setCredStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    checkCreds();
  }, [checkHealth, checkCreds]);

  const deriveCreds = async () => {
    setDeriving(true);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-derive-creds", {
        method: "POST",
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to derive credentials");
      toast({ title: "Credentials Generated", description: `Created at ${data.createdAt}` });
      await checkCreds();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeriving(false);
    }
  };

  const rotateCreds = async () => {
    setRotating(true);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-rotate-creds", {
        method: "POST",
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to rotate credentials");
      toast({ title: "Credentials Rotated", description: `New credentials created at ${data.createdAt}` });
      setTestResult(null);
      await checkCreds();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRotating(false);
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
      setTestResult({ ok: data?.ok ?? false, error: data?.error });
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const importCreds = async () => {
    if (!importForm.apiKey || !importForm.secret || !importForm.passphrase) {
      toast({ title: "Missing fields", description: "All three fields are required.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-import-creds", {
        method: "POST",
        body: importForm,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to import credentials");
      toast({ title: "Credentials Imported", description: `Stored at ${data.createdAt}` });
      setImportForm({ apiKey: "", secret: "", passphrase: "" });
      setTestResult(null);
      await checkCreds();
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
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
                <span className="text-sm text-muted-foreground w-36">Credentials stored:</span>
                {credStatus.hasCreds ? (
                  <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">
                    <Shield className="h-3 w-3 mr-1" /> Yes
                  </Badge>
                ) : (
                  <Badge variant="secondary">No</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-36">Last rotation:</span>
                <span className="text-sm font-mono">
                  {credStatus.updatedAt
                    ? new Date(credStatus.updatedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Generate Credentials */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" /> Generate API Credentials
          </CardTitle>
          <CardDescription>
            Derive Polymarket CLOB API credentials from the server-side wallet. The private key never leaves the backend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={deriveCreds} disabled={deriving}>
            {deriving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
            {deriving ? "Generating..." : "Generate Credentials"}
          </Button>
        </CardContent>
      </Card>

      {/* Import Real Credentials */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import API Credentials
          </CardTitle>
          <CardDescription>
            Paste real Polymarket CLOB API credentials derived from your L1 wallet. These will be encrypted and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-apiKey">API Key</Label>
            <Input
              id="import-apiKey"
              type="password"
              placeholder="Your Polymarket API key"
              value={importForm.apiKey}
              onChange={(e) => setImportForm(f => ({ ...f, apiKey: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-secret">Secret</Label>
            <Input
              id="import-secret"
              type="password"
              placeholder="Your API secret"
              value={importForm.secret}
              onChange={(e) => setImportForm(f => ({ ...f, secret: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-passphrase">Passphrase</Label>
            <Input
              id="import-passphrase"
              type="password"
              placeholder="Your API passphrase"
              value={importForm.passphrase}
              onChange={(e) => setImportForm(f => ({ ...f, passphrase: e.target.value }))}
            />
          </div>
          <Button onClick={importCreds} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {importing ? "Importing..." : "Import Credentials"}
          </Button>
        </CardContent>
      </Card>

      {/* Rotate Credentials */}
      <Card className="border-accent/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-accent-foreground">
            <AlertTriangle className="h-4 w-4" /> Rotate API Credentials
          </CardTitle>
          <CardDescription>
            Replace existing credentials with new ones. Previous credentials will be invalidated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={rotating || !credStatus.hasCreds} className="border-accent/30 text-accent-foreground hover:bg-accent/10">
                {rotating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Rotate Credentials
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate Polymarket API Credentials?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will generate new credentials and <strong>invalidate the old ones</strong>.
                  Any active sessions or integrations using the current credentials will stop working.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={rotateCreds}>Yes, Rotate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Separator />

      {/* Test Authentication */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Test Authentication</CardTitle>
          <CardDescription>
            Verify stored credentials work against the Polymarket CLOB API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="secondary" onClick={testAuth} disabled={testing || !credStatus.hasCreds}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
            {testing ? "Testing..." : "Test Auth"}
          </Button>
          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${testResult.ok ? "text-primary" : "text-destructive"}`}>
              {testResult.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult.ok ? "Authentication successful" : testResult.error || "Authentication failed"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
