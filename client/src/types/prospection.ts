export type ProspectedVenueType =
  | 'theatre'
  | 'cinema'
  | 'salle_spectacle'
  | 'mjc'
  | 'centre_culturel'
  | 'centre_social'
  | 'autre';

export type ProspectedEmailStatus =
  | 'non_envoye'
  | 'envoye'
  | 'echec'
  | 'desinscrit'
  | 'repondu';

export interface ProspectedVenueInput {
  name: string;
  type: ProspectedVenueType;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  departement?: string;
  website?: string;
  emailStatus?: ProspectedEmailStatus;
}

export interface IProspectedVenue {
  _id: string;
  name: string;
  type: ProspectedVenueType;
  email?: string | null;
  phone?: string | null;
  address: {
    street?: string;
    city?: string;
    postalCode?: string;
    departement?: string;
    departementName?: string;
  };
  website?: string | null;
  source: string;
  emailStatus: ProspectedEmailStatus;
  optOut: boolean;
  emailEnrichAttemptedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IProspectionConfig {
  _id: string;
  mode: 'auto' | 'manuel';
  cron: {
    expression: string;
    timezone: string;
    joursActifs: number[];
    heureEnvoi: string;
    prochainRun?: string | null;
  };
  cibles: {
    departements: string[];
    types: ProspectedVenueType[];
  };
  envoi: {
    maxEmailsParRun: number;
    delaiEntreEnvois: number;
    dryRunParDefaut: boolean;
    relance72hActive: boolean;
  };
  updatedBy?: string;
  updatedAt?: string;
}

export interface IProspectionRun {
  _id: string;
  trigger: 'manuel' | 'cron';
  startedAt: string;
  finishedAt?: string | null;
  filtres: {
    departements: string[];
    types: ProspectedVenueType[];
    maxEmails: number;
    dryRun: boolean;
  };
  stats: {
    found: number;
    new: number;
    merged?: number;
    duplicates?: number;
    websitesFound?: number;
    emailsEnriched?: number;
    emailsSent: number;
    emailsFailed: number;
  };
  status: 'running' | 'done' | 'error';
  error?: string | null;
}

export const VENUE_TYPE_OPTIONS: { value: ProspectedVenueType; label: string }[] = [
  { value: 'theatre', label: 'Théâtre' },
  { value: 'cinema', label: 'Cinéma' },
  { value: 'salle_spectacle', label: 'Salle de spectacle' },
  { value: 'mjc', label: 'MJC' },
  { value: 'centre_culturel', label: 'Centre culturel' },
  { value: 'centre_social', label: 'Centre social' },
  { value: 'autre', label: 'Autre' },
];

export const EMAIL_STATUS_LABELS: Record<ProspectedEmailStatus, string> = {
  non_envoye: 'Non envoyé',
  envoye: 'Envoyé',
  echec: 'Échec',
  desinscrit: 'Désinscrit',
  repondu: 'Répondu',
};

export const EMAIL_STATUS_OPTIONS: { value: ProspectedEmailStatus; label: string }[] = (
  Object.entries(EMAIL_STATUS_LABELS) as [ProspectedEmailStatus, string][]
).map(([value, label]) => ({ value, label }));

export const SOURCE_LABELS: Record<string, string> = {
  insee_bpe: 'BPE INSEE',
  openstreetmap: 'OpenStreetMap',
  google_places: 'Google Places',
  data_gouv: 'data.gouv.fr',
  scraping: 'Web',
  manuel: 'Manuel',
};

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

export interface IProspectionInboxVenue {
  _id: string;
  name: string;
  email?: string | null;
  emailStatus?: string | null;
}

export interface IProspectionInboxMessage {
  _id: string;
  messageId: string;
  from: string;
  fromName?: string | null;
  subject: string;
  snippet: string;
  receivedAt: string;
  handled: boolean;
  venue: IProspectionInboxVenue | null;
}

export interface IProspectionInboxStatus {
  configured: boolean;
  webmailUrl: string;
  imapUser: string | null;
}
