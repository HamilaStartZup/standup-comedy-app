import mongoose, { Schema, Document } from 'mongoose';
import type { ProspectedVenueType } from './ProspectedVenue';

export interface ProspectionRunDocument extends Document {
  trigger: 'manuel' | 'cron';
  startedAt: Date;
  finishedAt?: Date | null;
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
    duplicates: number;
    websitesFound?: number;
    emailsEnriched?: number;
    emailsSent: number;
    emailsFailed: number;
  };
  status: 'running' | 'done' | 'error';
  error?: string | null;
}

const prospectionRunSchema = new Schema<ProspectionRunDocument>(
  {
    trigger: { type: String, enum: ['manuel', 'cron'], required: true },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    filtres: {
      departements: { type: [String], default: [] },
      types: { type: [String], default: [] },
      maxEmails: { type: Number, default: 50 },
      dryRun: { type: Boolean, default: false },
    },
    stats: {
      found: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      merged: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      websitesFound: { type: Number, default: 0 },
      emailsEnriched: { type: Number, default: 0 },
      emailsSent: { type: Number, default: 0 },
      emailsFailed: { type: Number, default: 0 },
    },
    status: { type: String, enum: ['running', 'done', 'error'], default: 'running' },
    error: { type: String, default: null },
  },
  { timestamps: true, collection: 'prospection_runs' }
);

prospectionRunSchema.index({ status: 1, startedAt: -1 });

export const ProspectionRunModel = mongoose.model<ProspectionRunDocument>(
  'ProspectionRun',
  prospectionRunSchema
);
