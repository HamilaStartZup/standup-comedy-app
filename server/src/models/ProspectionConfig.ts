import mongoose, { Schema, Document } from 'mongoose';
import type { ProspectedVenueType } from './ProspectedVenue';

export interface ProspectionConfigDocument extends Document {
  mode: 'auto' | 'manuel';
  cron: {
    expression: string;
    timezone: string;
    joursActifs: number[];
    heureEnvoi: string;
    prochainRun?: Date | null;
  };
  cibles: {
    departements: string[];
    types: ProspectedVenueType[];
  };
  envoi: {
    maxEmailsParRun: number;
    delaiEntreEnvois: number;
    dryRunParDefaut: boolean;
  };
  updatedBy?: string;
}

const prospectionConfigSchema = new Schema<ProspectionConfigDocument>(
  {
    mode: { type: String, enum: ['auto', 'manuel'], default: 'manuel' },
    cron: {
      expression: { type: String, default: '0 9 * * 1,4' },
      timezone: { type: String, default: 'Europe/Paris' },
      joursActifs: { type: [Number], default: [1, 4] },
      heureEnvoi: { type: String, default: '09:00' },
      prochainRun: { type: Date, default: null },
    },
    cibles: {
      departements: {
        type: [String],
        default: ['75', '78', '91', '92', '93', '94', '95', '77'],
      },
      types: {
        type: [String],
        default: ['theatre', 'cinema', 'salle_spectacle', 'mjc', 'centre_culturel', 'centre_social'],
      },
    },
    envoi: {
      maxEmailsParRun: { type: Number, default: 50, min: 1, max: 200 },
      delaiEntreEnvois: { type: Number, default: 3, min: 2, max: 30 },
      dryRunParDefaut: { type: Boolean, default: false },
    },
    updatedBy: { type: String, default: 'Système' },
  },
  { timestamps: true, collection: 'prospection_config' }
);

export const ProspectionConfigModel = mongoose.model<ProspectionConfigDocument>(
  'ProspectionConfig',
  prospectionConfigSchema
);
