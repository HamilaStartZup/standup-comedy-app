export default function Footer() {
  return (
    <footer className="border-t border-[var(--ah-border)] mt-24">
      <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-sm text-[var(--ah-text-muted)]">
        <div>
          <div className="font-extrabold text-white">
            Aides<span className="text-[var(--ah-accent)]">.</span>Humour
          </div>
          <div className="mt-1">
            La plateforme des aides pour le stand-up et le spectacle vivant.
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://connectcomedyclub.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition"
          >
            Connect Comedy Club
          </a>
          <a href="mailto:contact@aides-humour.fr" className="hover:text-white transition">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
