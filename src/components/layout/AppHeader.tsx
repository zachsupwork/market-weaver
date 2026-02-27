import { Link, useLocation } from 'react-router-dom';
import { Activity, BarChart3, Radio, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountDropdown } from './AccountDropdown';

const navItems = [
  { to: "/", icon: BarChart3, label: "Markets" },
  { to: "/live", icon: Radio, label: "Live" },
  { to: "/leaderboard", icon: Trophy, label: "Leaders" },
  { to: "/account", icon: User, label: "Account" },
];

export function AppHeader() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 glass border-b border-border">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="text-base font-bold tracking-tight">
            Poly<span className="text-primary">View</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                location.pathname === to
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 inline mr-1.5" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <AccountDropdown />
      </div>
    </header>
  );
}
