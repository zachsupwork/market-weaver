import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  User, Copy, Check, LayoutDashboard, ArrowDownToLine,
  ArrowUpFromLine, PieChart, ClipboardList, History, Settings,
  LogOut, ChevronDown, Wifi, WifiOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AccountDropdown() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  if (!isConnected || !address) {
    return (
      <ConnectButton
        chainStatus="none"
        showBalance={false}
        accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
      />
    );
  }

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const isPolygon = chain?.id === 137;

  function copyAddress() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast({ title: "Address copied" });
    setTimeout(() => setCopied(false), 2000);
  }

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/account" },
    { icon: ArrowDownToLine, label: "Deposit", to: "/account?tab=deposit" },
    { icon: ArrowUpFromLine, label: "Withdraw", to: "/account?tab=withdraw" },
    { icon: PieChart, label: "Positions", to: "/account?tab=positions" },
    { icon: ClipboardList, label: "Orders", to: "/account?tab=orders" },
    { icon: History, label: "Trades", to: "/account?tab=trades" },
    { icon: Settings, label: "Settings", to: "/settings/polymarket" },
    { icon: Settings, label: "API Keys", to: "/settings/api-keys" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
          <User className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{shortAddr}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs">{shortAddr}</span>
            <button onClick={copyAddress} className="p-1 rounded hover:bg-accent">
              {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            {isPolygon ? (
              <>
                <Wifi className="h-3 w-3 text-primary" />
                <span className="text-primary">Polygon</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-warning" />
                <span className="text-warning">{chain?.name || "Wrong network"}</span>
              </>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {menuItems.map(({ icon: Icon, label, to }) => (
          <DropdownMenuItem key={to} onClick={() => navigate(to)} className="cursor-pointer gap-2">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => disconnect()} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
