import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { ProspectedVenueModel } from '../src/models/ProspectedVenue';
import { isValidEmail, normalizePhoneFR } from '../src/utils/prospectionHelpers';
import { getDepartmentFromPostalCode } from '../src/utils/cityMapping';

interface CsvVenueRow {
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string;
  postalCode?: string;
  departement?: string;
  source: string;
}

const DEPT_NAME_TO_CODE: Record<string, string> = {
  essonne: '91',
  'hauts-de-seine': '92',
  'seine-saint-denis': '93',
  yvelines: '78',
  "val-d'oise": '95',
  valdoise: '95',
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseEmail(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed || !isValidEmail(trimmed)) return null;
  return trimmed;
}

function parsePhone(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return normalizePhoneFR(trimmed);
}

function parseDepartementFromName(value: string): string | undefined {
  const key = value.trim().toLowerCase();
  return DEPT_NAME_TO_CODE[key];
}

function readFileLines(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split(/\r?\n/).filter((line) => line.trim());
}

function parseYvelinesRows(filePath: string): CsvVenueRow[] {
  const lines = readFileLines(filePath);
  const rows: CsvVenueRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 9) continue;

    rows.push({
      name: parts[0].trim(),
      email: parseEmail(parts[2]),
      phone: parsePhone(parts[3]),
      city: parts[6]?.trim() || undefined,
      postalCode: parts[7]?.trim() || undefined,
      departement: parts[8]?.trim() || undefined,
      source: path.basename(filePath),
    });
  }

  return rows;
}

function parseValdoiseRows(filePath: string): CsvVenueRow[] {
  const lines = readFileLines(filePath);
  const rows: CsvVenueRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 6) continue;

    const postalCode = parts[3]?.trim() || '';
    rows.push({
      name: parts[0].trim(),
      email: parseEmail(parts[4]),
      phone: parsePhone(parts[5]),
      city: parts[2]?.trim() || undefined,
      postalCode: postalCode || undefined,
      departement: postalCode ? getDepartmentFromPostalCode(postalCode) ?? '95' : '95',
      source: path.basename(filePath),
    });
  }

  return rows;
}

function parsePetitsDeptsRows(filePath: string): CsvVenueRow[] {
  const lines = readFileLines(filePath);
  const rows: CsvVenueRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 8) continue;

    const postalCode = parts[4]?.trim() || '';
    const departement =
      parseDepartementFromName(parts[0]) ??
      (postalCode ? getDepartmentFromPostalCode(postalCode) ?? undefined : undefined);

    rows.push({
      name: parts[1].trim(),
      email: parseEmail(parts[6]),
      phone: parsePhone(parts[7]),
      city: parts[3]?.trim() || undefined,
      postalCode: postalCode || undefined,
      departement,
      source: path.basename(filePath),
    });
  }

  return rows;
}

function detectFormat(filePath: string): 'yvelines' | 'valdoise' | 'petits-depts' {
  const header = readFileLines(filePath)[0]?.toLowerCase() ?? '';
  if (header.startsWith('name;')) return 'yvelines';
  if (header.startsWith('departement;')) return 'petits-depts';
  return 'valdoise';
}

function parseCsvFile(filePath: string): CsvVenueRow[] {
  const format = detectFormat(filePath);
  if (format === 'yvelines') return parseYvelinesRows(filePath);
  if (format === 'petits-depts') return parsePetitsDeptsRows(filePath);
  return parseValdoiseRows(filePath);
}

function isMissing(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === '';
}

async function findVenue(row: CsvVenueRow) {
  if (row.email) {
    const byEmail = await ProspectedVenueModel.findOne({ email: row.email });
    if (byEmail) return byEmail;
  }

  const nameRegex = new RegExp(`^${escapeRegex(row.name.trim())}$`, 'i');

  if (row.departement) {
    const byDept = await ProspectedVenueModel.findOne({
      name: nameRegex,
      'address.departement': row.departement,
    });
    if (byDept) return byDept;
  }

  if (row.postalCode) {
    const byCp = await ProspectedVenueModel.findOne({
      name: nameRegex,
      'address.postalCode': row.postalCode,
    });
    if (byCp) return byCp;
  }

  if (row.city) {
    const cityRegex = new RegExp(`^${escapeRegex(row.city.trim())}$`, 'i');
    const byCity = await ProspectedVenueModel.findOne({
      name: nameRegex,
      'address.city': cityRegex,
    });
    if (byCity) return byCity;
  }

  const byName = await ProspectedVenueModel.find({ name: nameRegex }).limit(5);
  if (byName.length === 1) return byName[0];

  return null;
}

async function tryAssignEmail(venueId: string, email: string): Promise<boolean> {
  const emailTaken = await ProspectedVenueModel.findOne({
    email,
    _id: { $ne: venueId },
  });
  return !emailTaken;
}

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0) {
    console.error('Usage: ts-node scripts/updateProspectedVenuesFromCsv.ts <fichier.csv> [...]');
    process.exit(1);
  }

  if (!config.database.url) {
    throw new Error('DATABASE_URL manquante');
  }

  const allRows: CsvVenueRow[] = [];
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fichier introuvable: ${filePath}`);
    }
    const rows = parseCsvFile(filePath);
    console.log(`📄 ${path.basename(filePath)} — ${rows.length} ligne(s) lues`);
    allRows.push(...rows);
  }

  await mongoose.connect(config.database.url);
  console.log(`\n🔍 Mise à jour de ${allRows.length} entrée(s) CSV…\n`);

  let emailsAdded = 0;
  let phonesAdded = 0;
  let unchanged = 0;
  let notFound = 0;
  let skippedNoData = 0;
  const notFoundList: string[] = [];

  for (const row of allRows) {
    if (!row.email && !row.phone) {
      skippedNoData++;
      continue;
    }

    const venue = await findVenue(row);
    if (!venue) {
      notFound++;
      notFoundList.push(`${row.name} (${row.departement ?? row.postalCode ?? row.city ?? '?'})`);
      continue;
    }

    const updates: Record<string, string> = {};
    let changed = false;

    if (row.email && isMissing(venue.email)) {
      const canAssign = await tryAssignEmail(venue._id.toString(), row.email);
      if (canAssign) {
        updates.email = row.email;
        changed = true;
        emailsAdded++;
      }
    }

    if (row.phone && isMissing(venue.phone)) {
      updates.phone = row.phone;
      changed = true;
      phonesAdded++;
    }

    if (!changed) {
      unchanged++;
      continue;
    }

    await ProspectedVenueModel.findByIdAndUpdate(venue._id, { $set: updates });
    const parts: string[] = [];
    if (updates.email) parts.push(`email: ${updates.email}`);
    if (updates.phone) parts.push(`tel: ${updates.phone}`);
    console.log(`  ✅ ${venue.name} — ${parts.join(', ')}`);
  }

  console.log('\n--- Résumé ---');
  console.log(`Emails ajoutés     : ${emailsAdded}`);
  console.log(`Téléphones ajoutés : ${phonesAdded}`);
  console.log(`Sans changement    : ${unchanged}`);
  console.log(`Sans email/tel CSV : ${skippedNoData}`);
  console.log(`Lieux non trouvés  : ${notFound}`);

  if (notFoundList.length > 0) {
    console.log('\nLieux non trouvés en base :');
    for (const item of notFoundList.slice(0, 30)) {
      console.log(`  - ${item}`);
    }
    if (notFoundList.length > 30) {
      console.log(`  … et ${notFoundList.length - 30} autre(s)`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
