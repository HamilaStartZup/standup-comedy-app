import sgMail from '@sendgrid/mail';
import { config } from '../../config/env';
import { ProspectedVenueModel } from '../../models/ProspectedVenue';
import { generateProspectionUnsubscribeToken, isProspectionFollowUpDue, isEligibleForProspectionFollowUp } from '../../utils/prospectionHelpers';
import { getSendGridFrom, isEmailsDisabled } from './prospectionConfigService';

const CAMPAIGN = 'invitation-plateforme-v1';
const FOLLOW_UP_CAMPAIGN = 'invitation-plateforme-v1-relance-72h';

if (config.email.smtpPass) {
  sgMail.setApiKey(config.email.smtpPass);
}

function buildInitialEmailHtml(venueName: string, unsubscribeUrl: string): string {
  const siteUrl = config.platform.url;
  return `
<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #7c3aed;">Connect Comedy Club</h2>
  <p>Bonjour,</p>
  <p>
    Je me permets de vous contacter au nom de <strong>Connect Comedy Club</strong>, une plateforme conçue pour
    connecter les salles, les humoristes et les organisateurs, un peu comme un Airbnb dédié aux lieux de comédie.
  </p>
  <p>
    Notre ambition est simple : aider les établissements comme <strong>${venueName}</strong> à gagner du temps,
    en visibilité et en opportunités, avec un outil pensé pour les réalités du terrain.
  </p>
  <p>
    Nous vous proposons de rejoindre Connect Comedy Club en tant que <strong>partenaire fondateur</strong> :
    votre établissement ferait partie des premières salles à tester la plateforme en conditions réelles,
    et vos retours seraient précieux pour façonner un service réellement utile aux lieux culturels.
  </p>
  <ul>
    <li>Tester la plateforme en avant-première et contribuer à ses évolutions</li>
    <li>Gagner en visibilité auprès d'humoristes et d'organisateurs à la recherche de salles</li>
    <li>Simplifier la mise en relation et l'organisation de vos futurs plateaux</li>
    <li>Participer au développement d'un écosystème stand-up plus fluide et plus accessible</li>
  </ul>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${siteUrl}" style="background: #7c3aed; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
      Découvrir la plateforme
    </a>
  </p>
  <p>
    Seriez-vous disponible pour un échange (visio ou café) dans les prochaines semaines ?
  </p>
  <p style="font-size: 0.9em; color: #666;">
    Connect Comedy Club — ${siteUrl}<br/>
    Cet email est adressé à un contact professionnel en lien avec votre activité.
  </p>
  <p style="font-size: 0.8em; color: #999; margin-top: 32px;">
    <a href="${unsubscribeUrl}" style="color: #999;">Se désinscrire de nos communications</a>
  </p>
</body>
</html>`;
}

function buildFollowUpEmailHtml(venueName: string, unsubscribeUrl: string): string {
  const siteUrl = config.platform.url;
  return `
<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #7c3aed;">Connect Comedy Club</h2>
  <p>Bonjour,</p>
  <p>
    Je me permets de revenir vers vous suite à mon précédent message concernant <strong>Connect Comedy Club</strong>,
    la plateforme qui connecte salles, humoristes et organisateurs, un peu comme un Airbnb dédié aux lieux de comédie.
  </p>
  <p>
    Je me disais que le sujet pouvait vous intéresser, notamment si vous souhaitez développer ou structurer
    votre programmation humour plus simplement pour <strong>${venueName}</strong>.
  </p>
  <ul>
    <li>Gagner en visibilité auprès d'humoristes et d'organisateurs</li>
    <li>Fluidifier la mise en relation pour de futurs plateaux</li>
    <li>Mieux centraliser les opportunités de programmation</li>
  </ul>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${siteUrl}" style="background: #7c3aed; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
      Découvrir la plateforme
    </a>
  </p>
  <p>
    Si vous êtes ouvert à un échange, je serais ravi de vous présenter la plateforme en 15 minutes
    (visio ou café, selon votre préférence).
  </p>
  <p style="font-size: 0.9em; color: #666;">
    Connect Comedy Club — ${siteUrl}<br/>
    Cet email est adressé à un contact professionnel en lien avec votre activité.
  </p>
  <p style="font-size: 0.8em; color: #999; margin-top: 32px;">
    <a href="${unsubscribeUrl}" style="color: #999;">Se désinscrire de nos communications</a>
  </p>
</body>
</html>`;
}

export async function sendProspectionEmail(
  venueId: string,
  venueName: string,
  email: string,
  dryRun: boolean
): Promise<{ sent: boolean; error?: string }> {
  if (dryRun || isEmailsDisabled()) {
    return { sent: false };
  }

  if (!config.email.smtpPass) {
    return { sent: false, error: 'SendGrid non configuré' };
  }

  const token = generateProspectionUnsubscribeToken(venueId, email);
  const unsubscribeUrl = `${config.api.url}/api/prospection/unsubscribe?token=${token}&venueId=${venueId}&email=${encodeURIComponent(email)}`;

  try {
    await sgMail.send({
      to: email,
      from: getSendGridFrom(),
      subject: `${venueName} — Découvrez Connect Comedy Club`,
      html: buildInitialEmailHtml(venueName, unsubscribeUrl),
      categories: ['prospection', CAMPAIGN],
    });

    await ProspectedVenueModel.findByIdAndUpdate(venueId, {
      $set: { emailStatus: 'envoye' },
      $push: {
        emailHistory: {
          sentAt: new Date(),
          campaign: CAMPAIGN,
          status: 'envoye',
          error: null,
        },
      },
    });

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur envoi';
    await ProspectedVenueModel.findByIdAndUpdate(venueId, {
      $set: { emailStatus: 'echec' },
      $push: {
        emailHistory: {
          sentAt: new Date(),
          campaign: CAMPAIGN,
          status: 'echec',
          error: message,
        },
      },
    });
    return { sent: false, error: message };
  }
}

export async function sendProspectionBatch(
  departements: string[],
  types: string[],
  maxEmails: number,
  dryRun: boolean,
  delaySeconds: number
): Promise<{ emailsSent: number; emailsFailed: number }> {
  const query: Record<string, unknown> = {
    emailStatus: 'non_envoye',
    optOut: false,
    email: { $type: 'string', $gt: '' },
  };

  if (departements.length > 0) {
    query['address.departement'] = { $in: departements };
  }
  if (types.length > 0) {
    query.type = { $in: types };
  }

  const venues = await ProspectedVenueModel.find(query).limit(maxEmails).lean();
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const venue of venues) {
    if (!venue.email) continue;
    const result = await sendProspectionEmail(
      venue._id.toString(),
      venue.name,
      venue.email,
      dryRun
    );
    if (result.sent) emailsSent++;
    else if (result.error) emailsFailed++;

    if (!dryRun && delaySeconds > 0) {
      await new Promise((r) => setTimeout(r, delaySeconds * 1000));
    }
  }

  return { emailsSent, emailsFailed };
}

async function sendProspectionFollowUpEmail(
  venueId: string,
  venueName: string,
  email: string
): Promise<{ sent: boolean; error?: string }> {
  if (isEmailsDisabled()) {
    return { sent: false };
  }

  const current = await ProspectedVenueModel.findById(venueId).select('emailStatus').lean();
  if (!current || !isEligibleForProspectionFollowUp(current.emailStatus)) {
    return { sent: false };
  }

  if (!config.email.smtpPass) {
    return { sent: false, error: 'SendGrid non configuré' };
  }

  const token = generateProspectionUnsubscribeToken(venueId, email);
  const unsubscribeUrl = `${config.api.url}/api/prospection/unsubscribe?token=${token}&venueId=${venueId}&email=${encodeURIComponent(email)}`;

  try {
    await sgMail.send({
      to: email,
      from: getSendGridFrom(),
      subject: `${venueName} — petit suivi concernant Connect Comedy Club`,
      html: buildFollowUpEmailHtml(venueName, unsubscribeUrl),
      categories: ['prospection', FOLLOW_UP_CAMPAIGN],
    });

    await ProspectedVenueModel.findByIdAndUpdate(venueId, {
      $push: {
        emailHistory: {
          sentAt: new Date(),
          campaign: FOLLOW_UP_CAMPAIGN,
          status: 'envoye',
          error: null,
        },
      },
    });

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur envoi relance';
    await ProspectedVenueModel.findByIdAndUpdate(venueId, {
      $push: {
        emailHistory: {
          sentAt: new Date(),
          campaign: FOLLOW_UP_CAMPAIGN,
          status: 'echec',
          error: message,
        },
      },
    });
    return { sent: false, error: message };
  }
}

export async function sendProspectionFollowUpBatch(
  delaySeconds: number
): Promise<{ followUpsSent: number; followUpsFailed: number; followUpsSkipped: number }> {
  const query: Record<string, unknown> = {
    emailStatus: 'envoye',
    optOut: false,
    email: { $type: 'string', $gt: '' },
    emailHistory: {
      $elemMatch: {
        campaign: CAMPAIGN,
        status: 'envoye',
      },
    },
    $nor: [
      {
        emailHistory: {
          $elemMatch: {
            campaign: FOLLOW_UP_CAMPAIGN,
          },
        },
      },
    ],
  };

  const venues = await ProspectedVenueModel.find(query).lean();
  let followUpsSent = 0;
  let followUpsFailed = 0;
  let followUpsSkipped = 0;

  for (const venue of venues) {
    if (!venue.email) continue;

    if (!isEligibleForProspectionFollowUp(venue.emailStatus)) {
      followUpsSkipped++;
      continue;
    }

    const initialEntry = venue.emailHistory
      ?.filter((h) => h.campaign === CAMPAIGN && h.status === 'envoye')
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())[0];

    if (!initialEntry || !isProspectionFollowUpDue(new Date(initialEntry.sentAt))) {
      followUpsSkipped++;
      continue;
    }

    const result = await sendProspectionFollowUpEmail(
      venue._id.toString(),
      venue.name,
      venue.email
    );
    if (result.sent) followUpsSent++;
    else if (result.error) followUpsFailed++;

    if (delaySeconds > 0) {
      await new Promise((r) => setTimeout(r, delaySeconds * 1000));
    }
  }

  return { followUpsSent, followUpsFailed, followUpsSkipped };
}
