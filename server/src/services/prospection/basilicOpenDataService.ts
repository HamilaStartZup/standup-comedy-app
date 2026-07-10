import { FRENCH_DEPARTMENTS } from '../../constants/frenchDepartments';
import { sleep } from '../../utils/prospectionHelpers';
import type { ProspectedVenueType } from '../../models/ProspectedVenue';
import type { ProspectionSearchResult } from './types';

const BASILIC_API_BASE =
  'https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/base-des-lieux-et-des-equipements-culturels/records';

const PAGE_SIZE = 100;

interface BasilicRecord {
  nom?: string;
  adresse?: string;
  code_postal?: string;
  libelle_geographique?: string;
  n_departement?: string;
  departement?: string;
  domaine?: string;
  sous_domaine?: string;
  label_et_appellation?: string;
  type_equipement_ou_lieu?: string;
}

interface BasilicQueryConfig {
  extraWhere?: string;
}

const BASILIC_BY_TYPE: Record<ProspectedVenueType, BasilicQueryConfig> = {
  cinema: { extraWhere: "domaine = 'Cinéma'" },
  theatre: {
    extraWhere: "domaine = 'Arts du spectacle' AND sous_domaine = 'Théâtre'",
  },
  salle_spectacle: {
    extraWhere: "domaine = 'Arts du spectacle'",
  },
  cafe_theatre: {
    extraWhere:
      "search(nom, 'café-théâtre') OR search(nom, 'cafe theatre') OR search(nom, 'café théâtre') OR search(label_et_appellation, 'café-théâtre')",
  },
  comedy_club: {
    extraWhere:
      "search(nom, 'comedy club') OR search(nom, 'club de comédie') OR search(label_et_appellation, 'comedy club') OR search(label_et_appellation, 'club de comédie')",
  },
  centre_culturel: {
    extraWhere:
      "search(label_et_appellation, 'centre culturel') OR search(label_et_appellation, 'médiathèque') OR search(label_et_appellation, 'espace culturel')",
  },
  mjc: {
    extraWhere:
      "search(nom, 'MJC') OR search(nom, 'maison des jeunes') OR search(nom, 'maison de quartier')",
  },
  centre_social: {
    extraWhere: "search(label_et_appellation, 'centre social') OR search(nom, 'centre social')",
  },
  autre: {
    extraWhere:
      "search(label_et_appellation, 'salle polyvalente') OR search(nom, 'salle des fêtes') OR search(nom, 'salle des fetes')",
  },
};

function formatDepartmentCode(department: string): string {
  return department.padStart(2, '0');
}

function buildWhereClause(department: string, type: ProspectedVenueType): string | null {
  const cfg = BASILIC_BY_TYPE[type];
  if (!cfg?.extraWhere) return null;
  const dept = formatDepartmentCode(department);
  return `n_departement = '${dept}' AND (${cfg.extraWhere})`;
}

function mapBasilicRecord(
  record: BasilicRecord,
  type: ProspectedVenueType,
  department: string
): ProspectionSearchResult | null {
  const name = record.nom?.trim();
  if (!name) return null;

  const postalCode = record.code_postal?.trim();
  const departement = record.n_departement ?? department;

  return {
    name,
    type,
    email: null,
    phone: null,
    address: {
      street: record.adresse?.trim(),
      city: record.libelle_geographique?.trim(),
      postalCode,
      departement,
      departementName: FRENCH_DEPARTMENTS[departement],
    },
    website: null,
    source: 'data_gouv',
  };
}

async function fetchBasilicPage(
  where: string,
  offset: number
): Promise<{ total: number; results: BasilicRecord[] }> {
  const url = `${BASILIC_API_BASE}?limit=${PAGE_SIZE}&offset=${offset}&where=${encodeURIComponent(where)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.warn(`Basilic API erreur HTTP ${res.status} pour ${where}`);
    return { total: 0, results: [] };
  }
  const data = (await res.json()) as { total_count?: number; results?: BasilicRecord[] };
  return { total: data.total_count ?? 0, results: data.results ?? [] };
}

export async function searchBasilicByDepartment(
  department: string,
  types: ProspectedVenueType[]
): Promise<ProspectionSearchResult[]> {
  const results: ProspectionSearchResult[] = [];
  const seen = new Set<string>();

  for (const type of types) {
    const where = buildWhereClause(department, type);
    if (!where) {
      console.warn(`Basilic: type "${type}" non configuré — ignoré`);
      continue;
    }

    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const page = await fetchBasilicPage(where, offset);
      total = page.total;
      if (page.results.length === 0) break;

      for (const record of page.results) {
        const mapped = mapBasilicRecord(record, type, department);
        if (!mapped) continue;

        const key = `${mapped.name}|${mapped.address.postalCode ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push(mapped);
      }

      offset += PAGE_SIZE;
      await sleep(300);
    }

    await sleep(400);
  }

  return results;
}
