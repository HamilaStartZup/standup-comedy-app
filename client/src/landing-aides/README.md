# landing-aides — intégration dans un projet Vite + React + Tailwind v3

Drop-in pour intégrer la landing « Aides.Humour » dans un projet **Vite + React Router + Tailwind 3.x**.

## Contenu

```
landing-aides/
├── components/
│   ├── Header.tsx       # nav top (react-router Link)
│   ├── Footer.tsx
│   └── AideCard.tsx     # carte d'aide réutilisable
├── pages/
│   ├── Home.tsx         # landing complète
│   └── Aides.tsx        # liste filtrable
├── data/
│   └── aides.json       # 7 aides nationales (DRAC, Sacem, SACD, Adami, CNM x2, DINERGIE)
├── lib/
│   └── types.ts         # type Aide + labels profils
└── styles/
    └── aides-humour.css # tokens CSS + classes .ah-* (ne casse rien d'existant)
```

Toutes les classes CSS custom sont **préfixées `.ah-*`** et les variables CSS sont préfixées **`--ah-*`** → aucun conflit possible avec le design-system existant.

## Étapes d'intégration (5 min)

### 1. Copier le dossier
Copier `landing-aides/` à la racine de ton projet, ou directement son contenu dans `src/` :

```bash
# Option A : sous-dossier (recommandé)
cp -r landing-aides standup-comedy-app/src/features/aides-humour

# Option B : éclater dans src/
cp landing-aides/components/* standup-comedy-app/src/components/
cp landing-aides/pages/*      standup-comedy-app/src/pages/
cp landing-aides/data/*       standup-comedy-app/src/data/
cp landing-aides/lib/*        standup-comedy-app/src/lib/
cp landing-aides/styles/*     standup-comedy-app/src/styles/
```

### 2. Importer le CSS une fois
Dans `src/main.tsx` (ou `src/index.css`), ajoute :

```ts
import "./features/aides-humour/styles/aides-humour.css";
// (ou ./styles/aides-humour.css selon l'option choisie)
```

### 3. Vérifier l'alias `@/*`
Dans `tsconfig.json` :
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

Dans `vite.config.ts` :
```ts
import path from "path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

### 4. Ajouter les routes
Dans ton fichier de routing (ex. `src/App.tsx`) :

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import Aides from "@/pages/Aides";

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/aides" element={<Aides />} />
        {/* tes autres routes ici */}
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
```

> Si tu veux que la landing soit accessible sur `/aides-humour` au lieu de `/` (pour ne pas écraser ta home), change les `path` ci-dessus en `/aides-humour` et `/aides-humour/aides`, et adapte les `<Link to="...">` dans `Home.tsx` et `Header.tsx`.

### 5. Police Inter (optionnel mais recommandé)

```bash
npm i @fontsource/inter
```

Puis dans `main.tsx` :
```ts
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
```

### 6. Tailwind v3 — rien à configurer
Le CSS portable utilise des classes Tailwind **standards** + classes personnalisées `.ah-*` définies dans `aides-humour.css`. Aucune extension de `tailwind.config.js` requise.

Si tu veux quand même ajouter les couleurs au thème Tailwind (pour pouvoir écrire `bg-ah-accent` etc.), ajoute dans `tailwind.config.js` :

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        "ah-bg": "#0b0f1e",
        "ah-bg-elev": "#141a2e",
        "ah-accent": "#ff5c7a",
        "ah-accent-2": "#5bc8e6",
        "ah-text": "#f5f7fb",
        "ah-text-muted": "#9aa3b8",
      },
    },
  },
};
```

## Tests à faire après intégration

- [ ] `/` affiche le hero avec gradient rose→violet→cyan sur « humoristes » et « spectacle vivant »
- [ ] Les 3 cartes flottantes du hero (Sacem / Adami / DINERGIE) sont blanches
- [ ] La section « Pour qui » a 6 cartes blanches
- [ ] La carte CTA en bas (`#a-propos`) reste sur fond dégradé sombre, titre blanc lisible
- [ ] `/aides` liste les 7 aides, filtres profil + catégorie + recherche fonctionnent
- [ ] Le placeholder de la barre de recherche est lisible (texte blanc sur fond navy)

## Dépendances nécessaires côté projet cible

```
react              ^18 ou ^19
react-dom          ^18 ou ^19
react-router-dom   ^6 ou ^7
tailwindcss        ^3.4
```

Aucune autre lib n'est utilisée par les composants (pas de Radix, pas de shadcn, pas de framer-motion).
