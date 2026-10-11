import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/mark";

export function Mast() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-ink">
          <Mark className="size-6 text-brass" />
          <span className="font-display text-2xl leading-none">Halden</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted">
          <Link to="/" hash="method" className="hover:text-ink">
            Method
          </Link>
          <Link to="/" hash="desk" className="hover:text-ink">
            Desk
          </Link>
        </nav>
      </div>
    </header>
  );
}
