import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, Settings } from 'lucide-react';

export function AppHeader() {
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
          <Link
            to="/"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <BarChart3 className="h-4 w-4 inline mr-1.5" />
            Markets
          </Link>
          <Link
            to="/admin"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <Settings className="h-4 w-4 inline mr-1.5" />
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
