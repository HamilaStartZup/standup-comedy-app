import sgMail from '@sendgrid/mail';
import { config } from '../../config/env';
import { ProspectedVenueModel } from '../../models/ProspectedVenue';
import { generateProspectionUnsubscribeToken } from '../../utils/prospectionHelpers';
import { getSendGridFrom, isEmailsDisabled } from './prospectionConfigService';

const CAMPAIGN = 'invitation-plateforme-v1';

if (config.email.smtpPass) {
  sgMail.setApiKey(config.email.smtpPass);
}

function buildEmailHtml(venueName: string, unsubscribeUrl: string): string {
  const siteUrl = config.frontend.url;
  return `
<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #7c3aed;">Connect Comedy Club</h2>
  <p>Bonjour,</p>
  <p>
    Nous contactons <strong>${venueName}</strong> car votre établissement accueille ou pourrait accueillir
    des spectacles vivants et de l'humour.
  </p>
  <p>
    <strong>Connect Comedy Club</strong> est la plateforme qui met en relation organisateurs, humoristes
    et lieux de spectacle pour simplifier la programmation de vos soirées.
  </p>
  <ul>
    <li>Gérez vos disponibilités et réservations en ligne</li>
    <li>Trouvez des humoristes adaptés à votre public</li>
    <li>Centralisez vos événements et candidatures</li>
  </ul>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${siteUrl}" style="background: #7c3aed; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
      Découvrir la plateforme
    </a>
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
      html: buildEmailHtml(venueName, unsubscribeUrl),
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
