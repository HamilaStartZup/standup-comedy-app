import { Link } from "react-router-dom";
import aidesData from "../data/aides.json";
import type { Aide } from "../lib/types";
import AideCard from "../components/AideCard";

const aides = aidesData as Aide[];

export default function Home() {
  const highlights = [...aides]
    .sort((a, b) => b.niveau_pertinence_humour - a.niveau_pertinence_humour)
    .slice(0, 3);

  return (
    <div className="w-full">
      <section className="relative">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight">
              Toutes les aides pour les{" "}
              <span className="ah-gradient-text">humoristes</span> et le{" "}
              <span className="ah-gradient-text">spectacle vivant</span>.
            </h1>
            <p className="mt-6 text-lg text-[var(--ah-text-muted)] max-w-xl">
              Subventions, fonds, résidences, dispositifs publics et privés —
              centralisés en un seul endroit. Trouvez en quelques clics les
              aides auxquelles vous êtes éligibles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/aides" className="ah-btn-primary">
                Explorer les aides
              </Link>
              <a href="#pour-qui" className="ah-btn-outline">
                Comment ça marche
              </a>
            </div>

            <dl className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {[
                { k: aides.length, v: "Aides référencées" },
                { k: "6", v: "Profils ciblés" },
                { k: "100 %", v: "Sources officielles" },
              ].map((s) => (
                <div key={s.v}>
                  <dt className="text-2xl font-extrabold text-white">{s.k}</dt>
                  <dd className="text-xs text-[var(--ah-text-muted)] mt-1">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative h-[460px] hidden lg:block">
            <div className="absolute top-0 right-0 w-80 ah-card p-5 rotate-[-3deg] shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#ff5c7a] to-[#5bc8e6]" />
                <div>
                  <div className="font-bold text-sm">Sacem</div>
                  <div className="text-xs text-[var(--ah-text-muted)]">Spectacle d&apos;humour</div>
                </div>
              </div>
              <div className="mt-3 ah-badge">Jusqu&apos;à 10 000 €</div>
              <p className="mt-3 text-xs text-[var(--ah-text-muted)]">
                Création de nouveaux spectacles humoristiques.
              </p>
            </div>
            <div className="absolute top-32 left-4 w-80 ah-card p-5 rotate-[2deg] shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#b07ac9] to-[#ff5c7a]" />
                <div>
                  <div className="font-bold text-sm">Adami</div>
                  <div className="text-xs text-[var(--ah-text-muted)]">Spectacle vivant</div>
                </div>
              </div>
              <div className="mt-3 ah-badge">40 % des salaires · 20 000 €</div>
              <p className="mt-3 text-xs text-[var(--ah-text-muted)]">
                Emploi d&apos;artistes-interprètes en création.
              </p>
            </div>
            <div className="absolute bottom-0 right-8 w-80 ah-card p-5 rotate-[-1deg] shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#5bc8e6] to-[#b07ac9]" />
                <div>
                  <div className="font-bold text-sm">DINERGIE</div>
                  <div className="text-xs text-[var(--ah-text-muted)]">Festivals d&apos;humour</div>
                </div>
              </div>
              <div className="mt-3 ah-badge">40 % · 10 000 €</div>
              <p className="mt-3 text-xs text-[var(--ah-text-muted)]">
                Programmation d&apos;humoristes en développement.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pour-qui" className="mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Une plateforme pensée pour <span className="ah-gradient-text">tous les acteurs</span>{" "}de l&apos;humour
          </h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { t: "Humoristes solo", d: "Bourses d'écriture, aides à la création de spectacle." },
            { t: "Auteurs", d: "Soutiens à l'écriture et à la création artistique." },
            { t: "Producteurs", d: "Aide à la production, à l'emploi artistique, à la diffusion." },
            { t: "Compagnies", d: "Subventions DRAC, conventionnement, projets collectifs." },
            { t: "Salles", d: "Aide à la diffusion d'artistes émergents." },
            { t: "Festivals", d: "Fonds de programmation, soutien à l'émergence humour." },
          ].map((p) => (
            <div key={p.t} className="ah-card p-6">
              <div className="font-bold text-white">{p.t}</div>
              <p className="mt-2 text-sm text-[var(--ah-text-muted)]">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="comment" className="mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Trois étapes pour trouver vos aides
          </h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {[
            { n: "01", t: "Identifiez votre profil", d: "Humoriste, compagnie, festival, salle… on adapte les recommandations." },
            { n: "02", t: "Filtrez les aides", d: "Par catégorie, type de projet, zone géographique ou montant." },
            { n: "03", t: "Candidatez en confiance", d: "Lien direct vers la source officielle et conditions à jour." },
          ].map((s) => (
            <div key={s.n} className="ah-card p-6">
              <div className="text-[var(--ah-accent)] font-extrabold text-sm">{s.n}</div>
              <div className="mt-2 font-bold text-white">{s.t}</div>
              <p className="mt-2 text-sm text-[var(--ah-text-muted)]">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex items-end justify-between gap-6 mb-10 flex-wrap">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Aides phares pour l&apos;humour
            </h2>
          </div>
          <Link to="/aides" className="ah-btn-outline text-sm">
            Voir toutes les aides
          </Link>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {highlights.map((a) => (
            <AideCard key={a.id} aide={a} />
          ))}
        </div>
      </section>

      <section id="a-propos" className="mx-auto max-w-7xl px-6 py-20">
        <div className="ah-card ah-card-cta p-10 md:p-14 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Prêt·e à trouver{" "}
            <span className="ah-gradient-text">votre prochaine aide</span> ?
          </h2>
          <p className="mt-4 text-[var(--ah-text-muted)] max-w-xl mx-auto">
            Toutes les aides nationales et régionales pour le spectacle vivant
            et l&apos;humour, vérifiées et mises à jour régulièrement.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Link to="/aides" className="ah-btn-primary">
              Explorer les aides
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
