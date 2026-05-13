import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--ah-border)] bg-[var(--ah-bg)]/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link to="/aides/accueil" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff5c7a] to-[#5bc8e6] text-sm font-black text-white">
            🎤
          </span>
          <span className="font-extrabold tracking-tight">
            Aides<span className="text-[var(--ah-accent)]">.</span>Humour
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--ah-text-muted)]">
          <Link to="/aides/accueil#pour-qui" className="hover:text-white transition">
            Pour qui
          </Link>
          <Link to="/aides/accueil#comment" className="hover:text-white transition">
            Comment ça marche
          </Link>
          <Link to="/aides/accueil#a-propos" className="hover:text-white transition">
            À propos
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/aides" className="ah-btn-primary text-sm">
            Trouver une aide
          </Link>
        </div>
      </div>
    </header>
  );
}
