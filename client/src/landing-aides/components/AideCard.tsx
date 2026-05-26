import type { Aide } from "../lib/types";

export default function AideCard({ aide }: { aide: Aide }) {
  return (
    <article className="ah-card p-6 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--ah-text-muted)]">
            {aide.organisme}
          </div>
          <h3 className="mt-1 text-lg font-bold leading-snug text-white">
            {aide.dispositif}
          </h3>
        </div>
        <span className="ah-badge whitespace-nowrap">{aide.categorie}</span>
      </div>

      <p className="mt-4 text-sm text-[var(--ah-text-muted)] leading-relaxed flex-1">
        {aide.description_courte}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-[var(--ah-text-muted)]">Montant</dt>
          <dd className="text-white font-medium mt-0.5">{aide.montant}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-[var(--ah-text-muted)]">Zone</dt>
          <dd className="text-white font-medium mt-0.5">{aide.zone_geographique}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {aide.profil_utilisateur.map((p) => (
          <span key={p} className="ah-badge ah-badge-muted">
            {p.replace("_", " ")}
          </span>
        ))}
      </div>

      <div className="mt-5 pt-5 border-t border-[var(--ah-border)] flex items-center justify-between">
        <a
          href={aide.url_source}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-[var(--ah-accent)] hover:underline"
        >
          Source officielle ↗
        </a>
        <span className="text-xs text-[var(--ah-text-muted)]">
          MAJ {aide.derniere_verification}
        </span>
      </div>
    </article>
  );
}
