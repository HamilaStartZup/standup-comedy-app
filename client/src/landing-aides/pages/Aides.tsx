import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import aidesData from "../data/aides.json";
import type { Aide, ProfilUtilisateur } from "../lib/types";
import { PROFIL_LABELS } from "../lib/types";
import AideCard from "../components/AideCard";

const aides = aidesData as Aide[];

const PROFILS: ProfilUtilisateur[] = [
  "humoriste_solo",
  "auteur",
  "producteur",
  "compagnie",
  "salle",
  "festival",
];

const CATEGORIES = ["subvention", "fonds", "bourse", "residence", "prix", "accompagnement"];

export default function Aides() {
  const [q, setQ] = useState("");
  const [profil, setProfil] = useState<ProfilUtilisateur | "all">("all");
  const [categorie, setCategorie] = useState<string>("all");

  const filtered = useMemo(() => {
    return aides.filter((a) => {
      if (profil !== "all" && !a.profil_utilisateur.includes(profil)) return false;
      if (categorie !== "all" && a.categorie !== categorie) return false;
      if (q.trim()) {
        const needle = q.toLowerCase();
        const hay = (
          a.organisme +
          " " +
          a.dispositif +
          " " +
          a.description_courte +
          " " +
          a.mots_cles.join(" ")
        ).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [q, profil, categorie]);

  return (
    <div className="w-full">
      <div className="mx-auto max-w-7xl px-6 pb-16">
      <div className="max-w-2xl">
        <Link
          to="/aides/accueil"
          className="inline-block text-sm text-[var(--ah-accent)] font-semibold hover:underline"
        >
          {"<-Retour"}
        </Link>
        <h1 className="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight">
          Explorez les <span className="ah-gradient-text">aides disponibles</span>
        </h1>
        <p className="mt-4 text-[var(--ah-text-muted)]">
          {aides.length} dispositifs référencés. Filtrez par profil et catégorie.
        </p>
      </div>

      <div className="mt-10 ah-panel p-5 grid md:grid-cols-3 gap-3">
        <input
          type="search"
          placeholder="Rechercher une aide, un organisme, un mot-clé…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:col-span-3 w-full bg-[var(--ah-bg)] border border-[var(--ah-border)] rounded-lg px-4 py-3 text-sm text-[var(--ah-text)] placeholder:text-[var(--ah-text-muted)] focus:outline-none focus:border-[var(--ah-accent)] transition"
        />
        <select
          value={profil}
          onChange={(e) => setProfil(e.target.value as ProfilUtilisateur | "all")}
          className="bg-[var(--ah-bg)] border border-[var(--ah-border)] rounded-lg px-4 py-3 text-sm text-[var(--ah-text)] focus:outline-none focus:border-[var(--ah-accent)] transition"
        >
          <option value="all">Tous les profils</option>
          {PROFILS.map((p) => (
            <option key={p} value={p}>
              {PROFIL_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className="bg-[var(--ah-bg)] border border-[var(--ah-border)] rounded-lg px-4 py-3 text-sm text-[var(--ah-text)] focus:outline-none focus:border-[var(--ah-accent)] transition"
        >
          <option value="all">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setQ("");
            setProfil("all");
            setCategorie("all");
          }}
          className="ah-btn-outline text-sm"
        >
          Réinitialiser
        </button>
      </div>

      <div className="mt-8 text-sm text-[var(--ah-text-muted)]">
        {filtered.length} aide{filtered.length > 1 ? "s" : ""} trouvée{filtered.length > 1 ? "s" : ""}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 ah-card p-12 text-center">
          <div className="text-3xl">🤷</div>
          <h3 className="mt-3 font-bold">Aucune aide ne correspond</h3>
          <p className="mt-2 text-sm text-[var(--ah-text-muted)]">
            Essayez d&apos;élargir vos filtres.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((a) => (
            <AideCard key={a.id} aide={a} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
