import { UserModel } from '../models/User';
import { AbsenceModel } from '../models/Absence';
import { ApplicationModel } from '../models/Application';
import { PresenceAlertModel } from '../models/PresenceAlert';
import { config } from '../config/env';
import sgMail from '@sendgrid/mail';

// Configuration SendGrid
sgMail.setApiKey(config.email.smtpPass);

/**
 * Calcule le score de présence d'un humoriste
 * Score = (participations / (participations + absences)) * 100
 * 
 * @param comedianId - ID de l'humoriste
 * @returns Score de présence (0-100) ou null si pas assez de données
 */
export const calculatePresenceScore = async (comedianId: string): Promise<{
  score: number;
  totalEvents: number;
  absences: number;
} | null> => {
  try {
    // Récupérer l'humoriste (avec stats pour cohérence avec l'affichage Répertoire)
    const comedian = await UserModel.findById(comedianId);
    if (!comedian || comedian.role !== 'COMEDIAN') {
      return null;
    }

    // Utiliser User.stats en priorité : même source que le "Taux de participation" affiché dans le Répertoire
    const statsTotalEvents = comedian.stats?.totalEvents ?? 0;
    const statsAbsences = comedian.stats?.absences ?? 0;
    const statsTotal = statsTotalEvents + statsAbsences;
    if (statsTotal > 0) {
      const score = Math.round((statsTotalEvents / statsTotal) * 100);
      return {
        score,
        totalEvents: statsTotalEvents,
        absences: statsAbsences
      };
    }

    // Fallback : compter depuis la BDD (Application + Absence)
    const absences = await AbsenceModel.countDocuments({ comedian: comedianId });

    const acceptedApplications = await ApplicationModel.find({
      comedian: comedianId,
      status: 'ACCEPTED'
    }).populate('event');

    const now = new Date();
    const completedEvents = acceptedApplications.filter(app => {
      const event = (app.event as any);
      if (!event || !event.date) return false;
      const eventDate = new Date(event.date);
      if (event.endTime) {
        const [hours, minutes] = event.endTime.split(':').map(Number);
        eventDate.setHours(hours, minutes, 0, 0);
      } else {
        eventDate.setHours(23, 59, 59, 999);
      }
      return eventDate < now;
    });

    let totalEvents = 0;
    for (const app of completedEvents) {
      const eventId = (app.event as any)._id;
      const hasAbsence = await AbsenceModel.exists({ event: eventId, comedian: comedianId });
      if (!hasAbsence) {
        totalEvents++;
      }
    }

    const total = totalEvents + absences;
    if (total === 0) {
      return null;
    }

    const score = Math.round((totalEvents / total) * 100);

    return {
      score,
      totalEvents,
      absences
    };
  } catch (error) {
    console.error('Erreur lors du calcul du score de présence:', error);
    return null;
  }
};

/**
 * Récupère le titre de l'événement correspondant à la plus récente absence d'un humoriste
 */
const getMostRecentAbsenceEventTitle = async (comedianId: string): Promise<string | null> => {
  const absence = await AbsenceModel.findOne({ comedian: comedianId })
    .sort({ markedAt: -1 })
    .populate('event', 'title')
    .lean();
  const event = absence?.event as { title?: string } | null;
  return event?.title ?? null;
};

/**
 * Envoie l'email d'alerte à l'humoriste lorsque son taux de présence est inférieur à 75%
 */
const sendPresenceAlertEmailToComedian = async (
  comedian: { _id: any; firstName: string; lastName: string; email: string },
  eventTitle: string | null
): Promise<void> => {
  try {
    if (!comedian?.email) {
      console.warn('⚠️ Humoriste sans email, envoi alerte présence ignoré');
      return;
    }

    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ 📧 Emails désactivés (DISABLE_EMAILS)');
      return;
    }

    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante');
      return;
    }

    const prenom = (comedian.firstName ?? '').trim() || 'Humoriste';
    const eventName = eventTitle?.trim() || 'certains événements';

    const subject = 'Alerte : taux de présence - Connect Comedy Club';

    const textContent = `Bonjour ${prenom},

Nous avons constaté votre absence à l'événement « ${eventName} », pour lequel vous aviez confirmé votre participation.

Nous comprenons que des imprévus peuvent survenir. Toutefois, nous vous rappelons que la fiabilité est essentielle au bon fonctionnement de la plateforme et à la confiance des organisateurs.

Nous vous informons que si votre taux d'absence atteint 75 %, votre compte sera automatiquement restreint. Cette restriction pourra inclure :

* Une limitation temporaire de candidature aux événements
* Une mise en visibilité réduite de votre profil
* Une suspension temporaire du compte

Nous vous invitons à rester vigilant(e) lors de vos prochaines candidatures et à nous prévenir au plus tôt en cas d'empêchement.

Si vous estimez qu'il s'agit d'une erreur ou souhaitez nous apporter des précisions, vous pouvez répondre directement à ce mail.

Merci pour votre compréhension et votre professionnalisme.

L'équipe Connect Comedy Club.`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerte taux de présence</title>
  <style>
    body { margin: 0; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .content { padding: 28px; }
    .content p { margin: 0 0 16px 0; }
    .event-name { font-weight: bold; color: #764ba2; }
    ul { margin: 16px 0; padding-left: 24px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Connect Comedy Club – Alerte présence</h1>
    </div>
    <div class="content">
      <p>Bonjour ${prenom},</p>
      <p>Nous avons constaté votre absence à l'événement <strong class="event-name">${eventName}</strong>, pour lequel vous aviez confirmé votre participation.</p>
      <p>Nous comprenons que des imprévus peuvent survenir. Toutefois, nous vous rappelons que la fiabilité est essentielle au bon fonctionnement de la plateforme et à la confiance des organisateurs.</p>
      <p>Nous vous informons que si votre taux d'absence atteint 75 %, votre compte sera automatiquement restreint. Cette restriction pourra inclure :</p>
      <ul>
        <li>Une limitation temporaire de candidature aux événements</li>
        <li>Une mise en visibilité réduite de votre profil</li>
        <li>Une suspension temporaire du compte</li>
      </ul>
      <p>Nous vous invitons à rester vigilant(e) lors de vos prochaines candidatures et à nous prévenir au plus tôt en cas d'empêchement.</p>
      <p>Si vous estimez qu'il s'agit d'une erreur ou souhaitez nous apporter des précisions, vous pouvez répondre directement à ce mail.</p>
      <p>Merci pour votre compréhension et votre professionnalisme.</p>
    </div>
    <div class="footer">
      <p><strong>L'équipe Connect Comedy Club</strong></p>
    </div>
  </div>
</body>
</html>`;

    await sgMail.send({
      from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
      to: comedian.email,
      subject,
      html: htmlContent,
      text: textContent,
      categories: ['alerte', 'presence', 'comedian']
    });
    console.log(`✅ Email d'alerte présence envoyé à l'humoriste ${comedian.email}`);
  } catch (error) {
    console.error(`❌ Erreur envoi email alerte présence à ${comedian?.email}:`, error);
  }
};

/**
 * Vérifie tous les humoristes et crée des alertes pour ceux avec un score < 75%
 * @returns Nombre d'alertes créées
 */
export const checkAndCreatePresenceAlerts = async (): Promise<number> => {
  try {
    console.log('🔍 Vérification des scores de présence des humoristes...');

    // Récupérer tous les humoristes
    const comedians = await UserModel.find({ role: 'COMEDIAN' });
    console.log(`📊 ${comedians.length} humoristes à vérifier`);

    let alertsCreated = 0;
    const lowPresenceComedians: Array<{
      comedian: any;
      score: number;
      totalEvents: number;
      absences: number;
    }> = [];

    for (const comedian of comedians) {
      const result = await calculatePresenceScore(comedian._id.toString());
      
      if (!result) {
        continue; // Pas assez de données
      }

      const { score, totalEvents, absences } = result;

      // Vérifier si le score est < 75% (au moins 1 événement pour avoir un taux significatif)
      if (score < 75 && totalEvents + absences >= 1) {
        // Vérifier si une alerte active existe déjà
        const existingAlert = await PresenceAlertModel.findOne({
          comedian: comedian._id,
          isActive: true
        });

        if (!existingAlert) {
          // Créer une nouvelle alerte
          await PresenceAlertModel.create({
            comedian: comedian._id,
            presenceScore: score,
            totalEvents,
            absences,
            alertSentAt: new Date(),
            isActive: true
          });

          lowPresenceComedians.push({
            comedian,
            score,
            totalEvents,
            absences
          });

          // Envoyer l'email d'alerte à l'humoriste (taux de présence < 75%)
          const eventTitle = await getMostRecentAbsenceEventTitle(comedian._id.toString());
          await sendPresenceAlertEmailToComedian(comedian, eventTitle);

          alertsCreated++;
        } else {
          // Mettre à jour l'alerte existante si le score a changé
          existingAlert.presenceScore = score;
          existingAlert.totalEvents = totalEvents;
          existingAlert.absences = absences;
          existingAlert.alertSentAt = new Date();
          await existingAlert.save();

          lowPresenceComedians.push({
            comedian,
            score,
            totalEvents,
            absences
          });
        }
      } else {
        // Si le score est >= 75%, désactiver les alertes actives
        await PresenceAlertModel.updateMany(
          { comedian: comedian._id, isActive: true },
          { isActive: false }
        );
      }
    }

    // Envoyer un email au Super Admin si des alertes ont été créées
    if (lowPresenceComedians.length > 0) {
      await sendPresenceAlertEmailToSuperAdmin(lowPresenceComedians);
    }

    console.log(`✅ Vérification terminée: ${alertsCreated} nouvelles alertes créées`);
    return alertsCreated;
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des scores de présence:', error);
    return 0;
  }
};

/**
 * Envoie un email au Super Admin avec la liste des humoristes à faible présence
 */
const sendPresenceAlertEmailToSuperAdmin = async (
  lowPresenceComedians: Array<{
    comedian: any;
    score: number;
    totalEvents: number;
    absences: number;
  }>
): Promise<void> => {
  try {
    // Récupérer tous les Super Admins
    const superAdmins = await UserModel.find({ role: 'SUPER_ADMIN' });
    
    if (superAdmins.length === 0) {
      console.log('⚠️ Aucun Super Admin trouvé pour envoyer l\'alerte');
      return;
    }

    // Mode économie mémoire
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ 📧 Emails désactivés pour économiser la mémoire');
      return;
    }

    // Vérifier la configuration email
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante');
      return;
    }

    // Préparer le contenu de l'email
    const subject = `⚠️ Alerte: ${lowPresenceComedians.length} humoriste(s) avec un score de présence < 75%`;

    const comediansList = lowPresenceComedians.map((item, index) => {
      const { comedian, score, totalEvents, absences } = item;
      return `
        <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : '#ffffff'};">
          <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">
            <strong>${comedian.firstName} ${comedian.lastName}</strong><br>
            <small style="color: #6c757d;">${comedian.email}</small>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #dee2e6; text-align: center;">
            <span style="color: ${score < 30 ? '#dc3545' : '#ffc107'}; font-weight: bold; font-size: 18px;">
              ${score}%
            </span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #dee2e6; text-align: center;">
            ${totalEvents}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #dee2e6; text-align: center;">
            <span style="color: #dc3545; font-weight: bold;">${absences}</span>
          </td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alerte Score de Présence</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
        }
        .content {
            padding: 30px;
        }
        .alert-box {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .alert-box h2 {
            margin: 0 0 10px 0;
            color: #856404;
            font-size: 24px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: bold;
        }
        th:last-child {
            text-align: center;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Alerte Score de Présence</h1>
        </div>
        
        <div class="content">
            <div class="alert-box">
                <h2>${lowPresenceComedians.length} humoriste(s) avec un score de présence < 75%</h2>
                <p style="margin: 0; color: #856404;">
                    Ces humoristes nécessitent une attention particulière.
                </p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Humoriste</th>
                        <th style="text-align: center;">Score</th>
                        <th style="text-align: center;">Présences</th>
                        <th style="text-align: center;">Absences</th>
                    </tr>
                </thead>
                <tbody>
                    ${comediansList}
                </tbody>
            </table>

            <p style="text-align: center; margin-top: 30px;">
                <a href="${config.frontend.url}/dashboard" 
                   style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: bold;">
                    📊 Voir le Dashboard
                </a>
            </p>
        </div>

        <div class="footer">
            <p><strong>L'équipe Connect Comedy Club</strong></p>
            <p>Connecter les talents avec les opportunités</p>
        </div>
    </div>
</body>
</html>
    `;

    const textContent = `
Alerte Score de Présence

${lowPresenceComedians.length} humoriste(s) avec un score de présence < 75%:

${lowPresenceComedians.map(item => {
  const { comedian, score, totalEvents, absences } = item;
  return `- ${comedian.firstName} ${comedian.lastName} (${comedian.email}): ${score}% (${totalEvents} présences, ${absences} absences)`;
}).join('\n')}

Connectez-vous au dashboard pour plus de détails: ${config.frontend.url}/dashboard

L'équipe Connect Comedy Club
    `.trim();

    // Envoyer l'email à tous les Super Admins
    const emailPromises = superAdmins.map(async (admin) => {
      try {
        await sgMail.send({
          from: {
            email: config.email.smtpUser,
            name: 'Connect Comedy Club'
          },
          to: admin.email,
          subject: subject,
          html: htmlContent,
          text: textContent,
          categories: ['alerte', 'presence', 'super-admin']
        });
        console.log(`✅ Email d'alerte envoyé à ${admin.email}`);
      } catch (error) {
        console.error(`❌ Erreur lors de l'envoi à ${admin.email}:`, error);
      }
    });

    await Promise.all(emailPromises);
    console.log(`✅ Emails d'alerte envoyés à ${superAdmins.length} Super Admin(s)`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi des emails d\'alerte:', error);
  }
};

