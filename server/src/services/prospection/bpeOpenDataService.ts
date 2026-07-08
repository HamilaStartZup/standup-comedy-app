import { FRENCH_DEPARTMENTS } from '../../constants/frenchDepartments';
import { getDepartmentFromPostalCode } from '../../utils/cityMapping';
import { normalizePhoneFR, sleep } from '../../utils/prospectionHelpers';
import type { ProspectedVenueType } from '../../models/ProspectedVenue';
import type { ProspectionSearchResult } from './types';
import { guessEmailFromWebsite } from './venueEnrichment';

const BPE_API_BASE =
  'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/bpe23-nettoye/records';

const PAGE_SIZE = 100;

interface BpeRecord {
  nomrs?: string;
  cnomrs?: string;
  numvoie?: number | string;
  typvoie?: string;
  libvoie?: string;
  cadr?: string;
  libcom?: string;
  codpos?: number | string;
  dep?: number | string;
  typequ?: string;
  lib_equ?: string;
}

interface BpeQueryConfig {
  typequ?: string[];
  nameSearch?: string;
  namePattern?: RegExp;
}

const BPE_QUERY_BY_TYPE: Record<ProspectedVenueType, BpeQueryConfig> = {
  cinema: { typequ: ['F303'] },
  theatre: { typequ: ['F315'], namePattern: /théâtre|theatre/i },
  salle_spectacle: { typequ: ['F315'] },
  cafe_theatre: {
    typequ: ['F315'],
    namePattern: /café.?théâtre|cafe.?theatre/i,
  },
  comedy_club: {
    nameSearch: 'comedy club',
    namePattern: /comedy club|club de comédie|club d'humour/i,
  },
  centre_culturel: {
    typequ: ['F312'],
    namePattern: /centre culturel|médiathèque|espace culturel/i,
  },
  mjc: { nameSearch: 'MJC', namePattern: /mjc|maison des jeunes|maison de quartier/i },
  centre_social: {
    nameSearch: 'centre social',
    namePattern: /^centre social|centre socioculturel/i,
  },
  autre: {
    nameSearch: 'salle polyvalente',
    namePattern: /salle polyvalente|salle des fêtes|salle des fetes/i,
  },
};

function formatDepartmentForBpe(department: string): string {
  return department;
}

function buildStreet(record: BpeRecord): string | undefined {
  if (record.cadr?.trim()) return record.cadr.trim();
  const parts = [record.numvoie, record.typvoie, record.libvoie].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

function mapBpeRecord(record: BpeRecord, type: ProspectedVenueType, department: string): ProspectionSearchResult | null {
  const name = (record.nomrs ?? record.cnomrs ?? '').trim();
  if (!name) return null;

  const cfg = BPE_QUERY_BY_TYPE[type];
  if (cfg.namePattern && !cfg.namePattern.test(name)) return null;

  const postalCode = record.codpos != null ? String(record.codpos).padStart(5, '0') : undefined;
  const departement =
    (record.dep != null ? String(record.dep) : null) ??
    (postalCode ? getDepartmentFromPostalCode(postalCode) : null) ??
    department;

  return {
    name,
    type,
    email: null,
    phone: null,
    address: {
      street: buildStreet(record),
      city: record.libcom?.trim(),
      postalCode,
      departement,
      departementName: FRENCH_DEPARTMENTS[departement],
    },
    website: null,
    source: 'insee_bpe',
  };
}

function buildWhereClause(department: string, type: ProspectedVenueType): string {
  const dept = formatDepartmentForBpe(department);
  const cfg = BPE_QUERY_BY_TYPE[type];
  const clauses = [`dep = '${dept}'`];

  if (cfg.typequ?.length === 1) {
    clauses.push(`typequ = '${cfg.typequ[0]}'`);
  } else if (cfg.typequ && cfg.typequ.length > 1) {
    clauses.push(`typequ IN (${cfg.typequ.map((t) => `'${t}'`).join(', ')})`);
  }

  if (cfg.nameSearch) {
    clauses.push(`search(nomrs, '${cfg.nameSearch.replace(/'/g, "''")}')`);
  }

  return clauses.join(' AND ');
}

async function fetchBpePage(where: string, offset: number): Promise<{ total: number; results: BpeRecord[] }> {
  const url = `${BPE_API_BASE}?limit=${PAGE_SIZE}&offset=${offset}&where=${encodeURIComponent(where)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    console.warn(`BPE API erreur HTTP ${res.status} pour ${where}`);
    return { total: 0, results: [] };
  }
  const data = await res.json() as { total_count?: number; results?: BpeRecord[] };
  return { total: data.total_count ?? 0, results: data.results ?? [] };
}

export async function searchBpeByDepartment(
  department: string,
  types: ProspectedVenueType[],
  enrichEmails: boolean
): Promise<ProspectionSearchResult[]> {
  const results: ProspectionSearchResult[] = [];
  const seen = new Set<string>();

  for (const type of types) {
    const where = buildWhereClause(department, type);
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const page = await fetchBpePage(where, offset);
      total = page.total;
      if (page.results.length === 0) break;

      for (const record of page.results) {
        const mapped = mapBpeRecord(record, type, department);
        if (!mapped) continue;

        const key = `${mapped.name}|${mapped.address.postalCode ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (enrichEmails && mapped.website) {
          mapped.email = await guessEmailFromWebsite(mapped.website);
        }

        results.push(mapped);
      }

      offset += PAGE_SIZE;
      await sleep(300);
    }

    await sleep(500);
  }

  return results;
}
