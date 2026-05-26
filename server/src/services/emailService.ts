import sgMail from '@sendgrid/mail';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User';
import { config } from '../config/env';
import { generateUnsubscribeToken } from '../utils/unsubscribeToken';

// Configuration SendGrid
sgMail.setApiKey(config.email.smtpPass); // Utilise SMTP_PASS comme API Key SendGrid

// SendGrid remplace Nodemailer - plus besoin de transporter

/**
 * Vérifie si l'utilisateur est abonné aux emails
 *
 * @param userId - ID MongoDB de l'utilisateur
 * @returns true si l'utilisateur peut recevoir des emails
 */
async function checkUserEmailSubscription(userId: string): Promise<boolean> {
  try {
    const user = await UserModel.findById(userId).select('emailSubscriptions email');

    if (!user) {
      console.log(`⚠️ User ${userId} not found - skipping email`);
      return false;
    }

    // Si emailSubscriptions n'existe pas, considérer comme abonné (backward compatibility)
    if (!user.emailSubscriptions) {
      return true;
    }

    const isSubscribed = user.emailSubscriptions.globalSubscribed !== false;

    if (!isSubscribed) {
      console.log(`📧 User ${user.email} (${userId}) is unsubscribed - skipping email`);
    }

    return isSubscribed;
  } catch (error) {
    console.error(`❌ Error checking subscription for user ${userId}:`, error);
    // En cas d'erreur, considérer comme abonné pour ne pas bloquer les emails
    return true;
  }
}

/**
 * Génère l'URL de désabonnement complète pour un utilisateur
 *
 * @param userId - ID de l'utilisateur
 * @param email - Email de l'utilisateur
 * @returns URL complète avec token HMAC (pour header List-Unsubscribe)
 */
function generateUnsubscribeUrl(userId: string, email: string): string {
  try {
    const token = generateUnsubscribeToken(userId, email);

    // Utiliser l'URL de l'API backend pour le désabonnement
    return `${config.api.url}/api/email/unsubscribe?token=${token}&userId=${userId}&email=${encodeURIComponent(email)}`;
  } catch (error) {
    console.error(`❌ Error generating unsubscribe URL for ${email}:`, error);
    // Fallback URL générique
    return `${config.frontend.url}/unsubscribe`;
  }
}

export const sendApplicationNotificationToOrganizer = async (eventData: any, humoristData: any, organizerData: any, applicationData: any) => {
  try {
    console.log('📬 Service Email: Notification candidature à l\'organisateur...');
    console.log('📧 Variables EMAIL disponibles:', {
      SMTP_USER: config.email.smtpUser ? 'Configuré' : 'MANQUANT',
      SMTP_PASS: config.email.smtpPass ? 'Configuré' : 'MANQUANT'
    });

    // ===== VÉRIFICATION ABONNEMENT EMAIL =====
    const organizerId = organizerData._id || organizerData.id;
    if (organizerId && !(await checkUserEmailSubscription(organizerId))) {
      console.log(`⏭️ Organisateur ${organizerData.email} est désabonné - email non envoyé`);
      return;
    }
    // =========================================

    // Mode économie mémoire - désactiver temporairement les emails
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ 📧 Emails désactivés pour économiser la mémoire (plan gratuit)');
      console.log('🔧 Pour réactiver les emails, définissez DISABLE_EMAILS=false sur Render');
      return;
    }

    // Vérifier la configuration email
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante:', {
        SMTP_USER: config.email.smtpUser ? 'Configuré' : 'MANQUANT',
        SMTP_PASS: config.email.smtpPass ? 'Configuré' : 'MANQUANT'
      });
      return;
    }

    console.log('✅ Configuration SendGrid OK - Prêt à envoyer !');

    // Préparer le contenu de l'email pour l'organisateur
    const subject = `🎭 Nouvelle candidature de ${humoristData.firstName} ${humoristData.lastName} pour "${eventData.title}"`;

    // Générer l'URL de désabonnement AVANT le template HTML
    const unsubscribeUrl = organizerId
      ? generateUnsubscribeUrl(organizerId.toString(), organizerData.email)
      : `${config.frontend.url}/unsubscribe`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nouvelle candidature reçue</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
        }
        .header .subtitle {
            margin-top: 10px;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 30px;
        }
        .humorist-card {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
            box-shadow: 0 10px 25px rgba(255, 107, 107, 0.3);
        }
        .humorist-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
        }
        .humorist-avatar {
            width: 60px;
            height: 60px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 24px;
            margin-right: 20px;
            border: 3px solid rgba(255,255,255,0.3);
        }
        .humorist-info h2 {
            margin: 0;
            font-size: 24px;
            font-weight: bold;
        }
        .humorist-info p {
            margin: 5px 0 0 0;
            opacity: 0.9;
            font-size: 16px;
        }
        .event-summary {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .event-title {
            font-size: 20px;
            color: #333;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .event-details {
            display: grid;
            gap: 8px;
            color: #666;
            font-size: 14px;
        }
        .detail-item {
            display: flex;
            align-items: center;
        }
        .detail-icon {
            margin-right: 8px;
            width: 20px;
        }
        .performance-details {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .performance-details h3 {
            margin: 0 0 10px 0;
            color: #1976d2;
            font-size: 16px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-item {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 12px;
            opacity: 0.9;
        }
        .cta-buttons {
            display: flex;
            gap: 15px;
            margin: 30px 0;
            justify-content: center;
        }
        .cta-button {
            display: inline-block;
            padding: 12px 25px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            font-size: 14px;
            text-align: center;
            min-width: 120px;
        }
        .btn-accept {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            box-shadow: 0 5px 15px rgba(40, 167, 69, 0.4);
        }
        .btn-review {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .contact-info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
            text-align: center;
        }
        .contact-info a {
            color: #0c5460;
            text-decoration: none;
            font-weight: bold;
        }
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 15px;
            }
            .header, .content {
                padding: 20px;
            }
            .humorist-card {
                padding: 20px;
            }
            .cta-buttons {
                flex-direction: column;
                align-items: center;
            }
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎭 Nouvelle Candidature Reçue !</h1>
            <div class="subtitle">Un humoriste souhaite participer à votre évènement</div>
        </div>
        
        <div class="content">
            <p>Bonjour <strong>${organizerData.firstName}</strong>,</p>
            <p>Excellente nouvelle ! Un humoriste vient de postuler pour votre évènement.</p>
            
            <div class="humorist-card">
                <div class="humorist-header">
                    <div class="humorist-avatar">
                        ${humoristData.firstName.charAt(0)}${humoristData.lastName.charAt(0)}
                    </div>
                    <div class="humorist-info">
                        <h2>${humoristData.firstName} ${humoristData.lastName}</h2>
                        <p>🎤 Humoriste stand-up</p>
                    </div>
                </div>
                
                <div class="contact-info">
                    📧 Contact : <a href="mailto:${humoristData.email}">${humoristData.email}</a>
                    ${humoristData.phone ? `<br>📞 Téléphone : ${humoristData.phone}` : ''}
                </div>
            </div>
            
            <div class="event-summary">
                <div class="event-title">📅 ${eventData.title}</div>
                <div class="event-details">
                    <div class="detail-item">
                        <span class="detail-icon">📍</span>
                        <span>${eventData.location.address}, ${eventData.location.city}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-icon">📆</span>
                        <span>${new Date(eventData.date).toLocaleDateString('fr-FR')}</span>
                    </div>
                    ${eventData.startTime ? `
                    <div class="detail-item">
                        <span class="detail-icon">⏰</span>
                        <span>${eventData.startTime}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            ${applicationData.performanceDetails ? `
            <div class="performance-details">
                <h3>🎭 Détails de la performance proposée</h3>
                ${applicationData.performanceDetails.duration ? `<p><strong>Durée :</strong> ${applicationData.performanceDetails.duration} minutes</p>` : ''}
                ${applicationData.performanceDetails.description ? `<p><strong>Description :</strong> ${applicationData.performanceDetails.description}</p>` : ''}
                ${applicationData.performanceDetails.videoLink ? `<p><strong>Vidéo :</strong> <a href="${applicationData.performanceDetails.videoLink}" target="_blank" style="color: #1976d2;">Voir la vidéo</a></p>` : ''}
            </div>
            ` : ''}
            
            ${applicationData.message ? `
            <div class="performance-details" style="background: #f0f8ff; border-left-color: #4682b4;">
                <h3>💬 Message de l'humoriste</h3>
                <p>${applicationData.message}</p>
            </div>
            ` : ''}
            
            ${humoristData.profile ? `
            <div class="stats-grid">
                ${humoristData.profile.experienceLevel ? `
                <div class="stat-item">
                    <div class="stat-value">${humoristData.profile.experienceLevel}</div>
                    <div class="stat-label">Niveau</div>
                </div>
                ` : ''}
                ${humoristData.stats && humoristData.stats.totalEvents ? `
                <div class="stat-item">
                    <div class="stat-value">${humoristData.stats.totalEvents}</div>
                    <div class="stat-label">Évènements</div>
                </div>
                ` : ''}
                ${humoristData.profile.genres && humoristData.profile.genres.length > 0 ? `
                <div class="stat-item">
                    <div class="stat-value">${humoristData.profile.genres.length}</div>
                    <div class="stat-label">Genres</div>
                </div>
                ` : ''}
            </div>
            ` : ''}
            
            <div class="cta-buttons">
                <a href="${config.frontend.url}/applications" class="cta-button btn-review">
                    📋 Voir les Candidatures
                </a>
            </div>
            
            <p style="text-align: center; color: #666; font-size: 14px;">
                Connectez-vous à votre tableau de bord pour examiner cette candidature en détail.
            </p>
        </div>

        <div class="footer">
            <p><strong>L'équipe Connect Comedy Club</strong></p>
            <p>Connecter les talents avec les opportunités</p>
        </div>

        <!-- Footer de désabonnement -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
            <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
            <p>
                <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
                    Se désabonner de tous les emails
                </a>
            </p>
        </div>
    </div>
</body>
</html>
    `;

    // Utiliser SendGrid pour envoyer l'email
    console.log('📧 Envoi email à l\'organisateur:', {
      to: organizerData.email,
      from: config.email.smtpUser,
      replyTo: humoristData.email,
      subject: subject
    });
    
    // Créer une version texte simple pour améliorer la délivrabilité
    const textContent = `
Nouvelle Candidature Reçue !

Bonjour ${organizerData.firstName},

Un humoriste vient de postuler pour votre évènement.

Humoriste: ${humoristData.firstName} ${humoristData.lastName}
Email: ${humoristData.email}
${humoristData.phone ? `Téléphone: ${humoristData.phone}` : ''}

Évènement: ${eventData.title}
Date: ${new Date(eventData.date).toLocaleDateString('fr-FR')}
Lieu: ${eventData.location.address}, ${eventData.location.city}

Connectez-vous à votre tableau de bord pour examiner cette candidature:
${config.frontend.url}/applications

L'équipe Connect Comedy Club
    `.trim();

    await sgMail.send({
      from: {
        email: config.email.smtpUser, // Email vérifié SendGrid
        name: 'Connect Comedy Club' // Nom de marque cohérent
      },
      replyTo: humoristData.email, // Les réponses iront directement à l'humoriste
      to: organizerData.email,
      subject: subject,
      html: htmlContent,
      text: textContent, // Version texte pour améliorer la délivrabilité
      mailSettings: {
        sandboxMode: {
          enable: false // Désactiver le mode sandbox en production
        }
      },
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `candidature-${Date.now()}` // ID unique pour le tracking
      },
      categories: ['candidature', 'notification'], // Catégories SendGrid pour le tracking
    });
    
    console.log(`✅ Notification envoyée à l'organisateur ${organizerData.firstName} ${organizerData.lastName} (${organizerData.email}) pour la candidature de ${humoristData.firstName} ${humoristData.lastName}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la notification à l\'organisateur:', error);
    console.error('🔍 Détail de l\'erreur:', error instanceof Error ? error.stack : 'Erreur inconnue');
    // Ne pas faire échouer la création de la candidature si l'email échoue
  }
};

export const sendNewEventNotificationToHumorists = async (eventData: any, organizerData: any) => {
  try {
    console.log('📬 Service Email: Début de la fonction d\'envoi...');
    console.log('📧 Variables EMAIL disponibles:', {
      SMTP_USER: config.email.smtpUser ? 'Configuré' : 'MANQUANT',
      SMTP_PASS: config.email.smtpPass ? 'Configuré' : 'MANQUANT',
      NODE_ENV: process.env.NODE_ENV,
      DISABLE_EMAILS: process.env.DISABLE_EMAILS
    });
    
    // Mode économie mémoire - désactiver temporairement les emails
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ 📧 Emails désactivés pour économiser la mémoire (plan gratuit)');
      console.log('🔧 Pour réactiver les emails, définissez DISABLE_EMAILS=false sur Render');
      return;
    }
    
    // Vérifier la configuration email
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante:', {
      SMTP_USER: config.email.smtpUser ? 'Configuré' : 'MANQUANT',
      SMTP_PASS: config.email.smtpPass ? 'Configuré' : 'MANQUANT'
    });
      return;
    }
    
    console.log('✅ Configuration SendGrid OK - Prêt à envoyer !');
    
    // Récupérer tous les humoristes AVEC emailSubscriptions
    const humorists = await UserModel.find({ role: 'COMEDIAN' })
      .select('_id email firstName lastName emailSubscriptions');
    console.log(`🎭 ${humorists.length} humoristes trouvés dans la base`);

    // ===== FILTRER LES HUMORISTES ABONNÉS =====
    const subscribedHumorists = humorists.filter(h =>
      h.emailSubscriptions?.globalSubscribed !== false
    );
    console.log(
      `📧 ${subscribedHumorists.length} humoristes abonnés ` +
      `(${humorists.length - subscribedHumorists.length} désabonnés ignorés)`
    );
    // ==========================================

    if (subscribedHumorists.length === 0) {
      console.log('❌ Aucun humoriste abonné pour l\'envoi de notifications');
      return;
    }

    // Préparer le contenu de l'email personnalisé avec l'organisateur
    // Sujet optimisé pour éviter les filtres spam (emoji en fin, pas au début)
    const subject = `Nouvel évènement - ${eventData.title} 🎤`;
    
    const requirementItems: string[] = [];

    if (eventData.requirements?.duration) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Durée : <strong style="color:#000000;font-weight:bold;">${eventData.requirements.duration} minutes</strong></li>`
      );
    }

    if (eventData.requirements?.maxPerformers) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Performeurs max : <strong style="color:#000000;font-weight:bold;">${eventData.requirements.maxPerformers}</strong></li>`
      );
    }

    if (eventData.requirements?.minExperience) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Expérience min : <strong style="color:#000000;font-weight:bold;">${eventData.requirements.minExperience} ans</strong></li>`
      );
    }

    const requirementsSection = requirementItems.length
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#fff8e5;background:#fff8e5;border:2px solid #f0c674;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:10px;color:#000000;font-size:16px;font-weight:bold;">📋 Exigences de l'évènement</strong>
                <ul style="padding-left:20px;margin:0;list-style:disc;color:#000000;">
                  ${requirementItems.join('')}
                </ul>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const descriptionSection = eventData.description
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#eef5ff;background:#eef5ff;border-left:4px solid #0066cc;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:8px;color:#000000;font-size:16px;font-weight:bold;">📝 Description</strong>
                <span style="color:#000000;display:block;margin-top:6px;">${eventData.description}</span>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nouvel évènement disponible</title>
    <style>
      body {
        margin: 0 !important;
        padding: 0 !important;
        background-color: #f2f2f2;
      }
      table {
        border-spacing: 0;
        border-collapse: collapse;
      }
      img {
        border: 0;
        line-height: 100%;
        text-decoration: none;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f2f2f2;">
    <center style="width:100%;background:#f2f2f2;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;box-shadow:0 3px 12px rgba(24,36,56,0.08);">
        <tr>
          <td style="padding:28px 24px;background:#1f1b2c;color:#ffffff;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;line-height:30px;">Nouvel évènement disponible</p>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#d9d6ff;">Une nouvelle opportunité est ouverte sur Connect Comedy Club.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2a41;">
                  Bonjour,<br/><br/>
                  ${organizerData.firstName} ${organizerData.lastName} vient de publier un évènement auquel vous pouvez postuler.
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table role="presentation" width="100%" style="border:1px solid #e3e6f0;border-radius:8px;">
                    <tr>
                      <td style="padding:18px 20px;background-color:#f7f8fc;background:#f7f8fc;border-bottom:2px solid #d0d5e0;font-family:Arial,Helvetica,sans-serif;">
                        <span style="display:block;font-size:12px;letter-spacing:1.2px;color:#333333;text-transform:uppercase;font-weight:bold;">Évènement</span>
                        <strong style="display:block;margin-top:8px;font-size:22px;color:#000000;font-weight:bold;">${eventData.title}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 20px;background-color:#ffffff;">
                        <table role="presentation" width="100%">
                          <tr>
                            <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;font-weight:normal;">
                              <strong style="color:#000000;font-weight:bold;">📍 Adresse :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${eventData.location.address}, ${eventData.location.city}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">📅 Date :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${new Date(eventData.date).toLocaleDateString('fr-FR')}</span>
                            </td>
                          </tr>
                          ${
                            eventData.startTime
                              ? `
                          <tr>
                            <td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">⏰ Heure :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${eventData.startTime}</span>
                            </td>
                          </tr>
                          `
                              : ''
                          }
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" width="100%" style="border:2px solid #dbe8ff;border-radius:8px;background-color:#f0f5ff;">
                    <tr>
                      <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;background-color:#f0f5ff;">
                        <strong style="display:block;font-size:16px;color:#000000;font-weight:bold;margin-bottom:8px;">👤 Organisateur</strong>
                        <span style="display:block;margin-top:6px;color:#000000;font-size:15px;">${organizerData.firstName} ${organizerData.lastName}</span>
                        <a href="mailto:${organizerData.email}" style="display:inline-block;margin-top:10px;color:#0066cc;text-decoration:underline;font-weight:bold;font-size:14px;">📧 Contacter ${organizerData.firstName}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              ${descriptionSection}
              ${requirementsSection}
              <tr>
                <td align="center" style="padding:20px 0;">
                  <a href="${config.frontend.url}/events" style="display:inline-block;padding:16px 40px;background-color:#ff5a5f;background:#ff5a5f;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;border:2px solid #ff5a5f;text-align:center;min-width:200px;">🚀 Je postule maintenant</a>
                </td>
              </tr>
              <tr>
                <td style="height:20px;font-size:20px;line-height:20px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#6c6f85;text-align:center;">
                  Connectez-vous à votre espace Connect Comedy Club pour candidater rapidement.
                </td>
              </tr>
            </table>
          </td>
</tr>
        <tr>
          <td style="padding:18px 24px;background:#f7f8fc;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#7b7f95;">
              Connect Comedy Club · Restez inspiré et à l'écoute des nouvelles scènes.
            </p>
          </td>
        </tr>

        <!-- Footer de désabonnement -->
        <tr>
          <td style="padding:40px 24px 20px 24px;border-top:1px solid #e0e0e0;text-align:center;">
            <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#666;">
              Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">
              <a href="\${unsubscribeUrl}" style="color:#666;text-decoration:underline;">
                Se désabonner de tous les emails
              </a>
            </p>
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>
    `;

    // Envoyer l'email à tous les humoristes avec SendGrid
    console.log(`🚀 Début de l'envoi des emails à ${subscribedHumorists.length} humoristes...`);
    console.log(`📧 Configuration SendGrid:`, {
      fromEmail: config.email.smtpUser,
      fromName: `${organizerData.firstName} ${organizerData.lastName}`,
      replyTo: organizerData.email,
      subject: subject
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    // Créer une version texte simple pour améliorer la délivrabilité
    const textContent = `
Nouvel Évènement Disponible !

Bonjour,

Une nouvelle opportunité vient d'être publiée sur Connect Comedy Club !

Organisateur: ${organizerData.firstName} ${organizerData.lastName}
Email: ${organizerData.email}

Évènement: ${eventData.title}
Date: ${new Date(eventData.date).toLocaleDateString('fr-FR')}
Lieu: ${eventData.location.address}, ${eventData.location.city}
${eventData.startTime ? `Heure: ${eventData.startTime}` : ''}

${eventData.description ? `Description: ${eventData.description}` : ''}

${eventData.requirements ? `
Exigences:
- Durée: ${eventData.requirements.duration} minutes
- Nombre maximum de performeurs: ${eventData.requirements.maxPerformers}
- Expérience minimale: ${eventData.requirements.minExperience} ans
` : ''}

Postulez maintenant: ${config.frontend.url}/events

L'équipe Connect Comedy Club
    `.trim();

    const emailPromises = subscribedHumorists.map(async (humorist, index) => {
      try {
        // Ajouter un délai entre les envois pour éviter les envois en masse simultanés
        // Cela améliore la délivrabilité en évitant de déclencher les filtres anti-spam
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms entre chaque email
        }

        console.log(`📧 [${index + 1}/${subscribedHumorists.length}] Envoi à ${humorist.email}...`);

        const unsubscribeUrl = generateUnsubscribeUrl(
          humorist._id.toString(),
          humorist.email
        );

        // Générer le htmlContent pour cet humoriste spécifique avec son unsubscribeUrl
        const htmlContentForHumorist = htmlContent.replace(/\$\{unsubscribeUrl\}/g, unsubscribeUrl);

        const result = await sgMail.send({
          from: {
            email: config.email.smtpUser,
            name: 'Connect Comedy Club' // Nom de marque cohérent au lieu du nom de l'organisateur
          },
          replyTo: organizerData.email, // Les réponses iront directement à l'organisateur
          to: humorist.email,
          subject: subject,
          html: htmlContentForHumorist,
          text: textContent, // Version texte pour améliorer la délivrabilité
          mailSettings: {
            sandboxMode: {
              enable: false // Désactiver le mode sandbox en production
            }
          },
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Entity-Ref-ID': `evenement-${eventData._id || Date.now()}-${index}`, // ID unique pour le tracking
            'Precedence': 'bulk' // Indiquer que c'est un email en masse
          },
          categories: ['evenement', 'notification', 'opportunite'], // Catégories SendGrid pour le tracking
          customArgs: {
            eventId: eventData._id?.toString() || 'unknown',
            organizerId: organizerData._id?.toString() || 'unknown',
            type: 'new_event_notification'
          }
        });
        console.log(`✅ [${index + 1}/${subscribedHumorists.length}] Email envoyé avec succès à ${humorist.email}`, result[0]?.statusCode);
        successCount++;
      } catch (emailError: any) {
        errorCount++;
        console.error(`❌ [${index + 1}/${subscribedHumorists.length}] Erreur lors de l'envoi à ${humorist.email}:`, {
          message: emailError?.message,
          response: emailError?.response?.body,
          code: emailError?.code
        });
        // Continuer avec les autres emails même si un échoue
      }
    });

    await Promise.all(emailPromises);

    console.log(
      `📊 Résumé de l'envoi: ${successCount} succès, ${errorCount} erreurs ` +
      `sur ${subscribedHumorists.length} humoristes abonnés`
    );
    console.log(`✅ Notifications envoyées à ${successCount} humoristes pour l'évènement "${eventData.title}" par ${organizerData.firstName} ${organizerData.lastName}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi des notifications d\'évènement:', error);
    console.error('🔍 Détail de l\'erreur:', error instanceof Error ? error.stack : 'Erreur inconnue');
    // Ne pas faire échouer la création de l'évènement si l'email échoue
  }
};

export const sendApplicationStatusToComedian = async (
  comedian: any,
  event: any,
  organizer: any,
  status: 'ACCEPTED' | 'REJECTED',
  organizerMessage: string
) => {
  // ===== VÉRIFICATION ABONNEMENT EMAIL =====
  const comedianId = comedian._id || comedian.id;
  if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
    console.log(`⏭️ Comédien ${comedian.email} est désabonné - email non envoyé`);
    return;
  }
  // =========================================

  const subject = status === 'ACCEPTED'
    ? `Bonne nouvelle - Candidature acceptée pour "${event.title}" 🎉`
    : `Candidature non retenue pour "${event.title}"`;

  // Générer l'URL de désabonnement AVANT le template HTML
  const unsubscribeUrl = comedianId
    ? generateUnsubscribeUrl(comedianId.toString(), comedian.email)
    : `${config.frontend.url}/unsubscribe`;

  const htmlContent = `
  <div style="font-family: Arial, sans-serif; background: #f8f9fa; padding: 30px;">
    <div style="max-width: 600px; margin: auto; background: white; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); padding: 32px;">
      <h2 style="color: ${status === 'ACCEPTED' ? '#28a745' : '#dc3545'}; text-align: center;">
        ${status === 'ACCEPTED' ? 'Félicitations !' : 'Candidature non retenue'}
      </h2>
      <p style="font-size: 1.1em; text-align: center;">
        ${status === 'ACCEPTED'
          ? `Votre candidature pour l'évènement <b>${event.title}</b> a été <b>acceptée</b> par l'organisateur.`
          : `Votre candidature pour l'évènement <b>${event.title}</b> n'a pas été retenue par l'organisateur.`}
      </p>
      <div style="margin: 24px 0; padding: 18px; background: #f0f0f0; border-radius: 8px;">
        <b>Message de l'organisateur :</b><br/>
        <i>${organizerMessage ? organizerMessage : '(Aucun message personnalisé)'}</i>
      </div>
      <div style="margin: 24px 0; padding: 18px; background: #e3f2fd; border-radius: 8px;">
        <b>Détails de l'évènement :</b><br/>
        <span>📅 <b>${event.title}</b></span><br/>
        <span>🗓️ ${new Date(event.date).toLocaleDateString('fr-FR')}</span><br/>
        <span>📍 ${event.location.address}, ${event.location.city}</span>
      </div>
      <div style="text-align: center; margin-top: 32px;">
        <a href="${config.frontend.url}/applications" style="display: inline-block; padding: 14px 32px; background: linear-gradient(90deg, #667eea, #764ba2); color: white; border-radius: 24px; text-decoration: none; font-weight: bold; font-size: 1.1em;">Voir mes candidatures</a>
      </div>
      <p style="text-align: center; color: #888; margin-top: 32px; font-size: 0.95em;">L'équipe Connect Comedy Club</p>

      <!-- Footer de désabonnement -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
        <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
        <p>
          <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
            Se désabonner de tous les emails
          </a>
        </p>
      </div>
    </div>
  </div>
  `;

  // Version texte pour améliorer la délivrabilité
  const textContent = `
${status === 'ACCEPTED' ? 'Félicitations !' : 'Candidature non retenue'}

${status === 'ACCEPTED'
  ? `Votre candidature pour l'évènement "${event.title}" a été acceptée par l'organisateur.`
  : `Votre candidature pour l'évènement "${event.title}" n'a pas été retenue par l'organisateur.`}

${organizerMessage ? `Message de l'organisateur: ${organizerMessage}` : ''}

Détails de l'évènement:
- ${event.title}
- Date: ${new Date(event.date).toLocaleDateString('fr-FR')}
- Lieu: ${event.location.address}, ${event.location.city}

Voir mes candidatures: ${config.frontend.url}/applications

L'équipe Connect Comedy Club
  `.trim();

  await sgMail.send({
    from: {
      email: config.email.smtpUser,
      name: 'Connect Comedy Club'
    },
    replyTo: organizer.email,
    to: comedian.email,
    subject,
    html: htmlContent,
    text: textContent,
    mailSettings: {
      sandboxMode: {
        enable: false
      }
    },
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Entity-Ref-ID': `status-${status}-${Date.now()}`
    },
    categories: ['candidature', 'status', status.toLowerCase()],
  });
}; 

// Notifier les humoristes ayant déjà postulé quand un évènement est modifié
export const sendEventUpdatedNotificationToApplicants = async (
  applications: Array<{ _id: string; comedian: any }>,
  event: any,
  organizer: { firstName: string; lastName: string; email: string },
  changes: string[] = []
) => {
  if (!applications || applications.length === 0) return;

  const subject = `✏️ Mise à jour de l'évènement "${event.title}"`;
  const frontendBase = config.frontend.url;

  const changesHtml = changes.length > 0
    ? `
        <div style="margin: 16px 0; padding: 16px; background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 8px;">
          <strong style="display: block; margin-bottom: 8px;">📋 Informations modifiées :</strong>
          <ul style="margin: 0; padding-left: 20px;">
            ${changes.map(c => `<li style="margin-bottom: 4px;">${c}</li>`).join('')}
          </ul>
        </div>`
    : '';

  const changesText = changes.length > 0
    ? `\nInformations modifiées :\n${changes.map(c => `  • ${c}`).join('\n')}\n`
    : '';

  const sendAll = applications.map(async (app: any) => {
    const comedian = app.comedian;
    if (!comedian?.email) return Promise.resolve();

    // ===== VÉRIFICATION ABONNEMENT EMAIL =====
    const comedianId = comedian._id || comedian.id;
    if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
      console.log(`⏭️ Comédien ${comedian.email} est désabonné - email non envoyé`);
      return Promise.resolve();
    }
    // =========================================

    const loginUrl = `${frontendBase}/login?redirect=/applications`;

    const html = `
    <div style="font-family: Arial, sans-serif; background: #f8f9fa; padding: 30px;">
      <div style="max-width: 600px; margin: auto; background: white; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); padding: 24px;">
        <h2 style="margin-top:0">✏️ L'organisateur a modifié un évènement</h2>
        <p>Bonjour ${comedian.firstName || ''},</p>
        <p>L'évènement auquel vous avez postulé a été mis à jour par <b>${organizer.firstName} ${organizer.lastName}</b>.</p>
        ${changesHtml}
        <div style="margin: 16px 0; padding: 16px; background:#e3f2fd; border-left: 4px solid #2196f3; border-radius: 8px;">
          <strong style="display: block; margin-bottom: 8px;">État actuel de l'évènement</strong>
          <div><b>📛 Titre:</b> ${event.title}</div>
          <div><b>📅 Date:</b> ${new Date(event.date).toLocaleDateString('fr-FR')}</div>
          <div><b>📍 Lieu:</b> ${event.location?.address || ''} ${event.location?.city ? `- ${event.location.city}` : ''}</div>
          ${event.startTime ? `<div><b>⏰ Heure:</b> ${event.startTime}</div>` : ''}
        </div>
        <p>Pour confirmer si vous restez inscrit ou vous désinscrire, connectez-vous sur votre espace candidatures.</p>
        <div style="text-align:center; margin-top: 20px;">
          <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#667eea;color:#fff;border-radius:24px;text-decoration:none;font-weight:bold">Se connecter</a>
        </div>
        <p style="color:#888; margin-top:24px;">Cet email est automatique. Merci de ne pas y répondre.</p>

        <!-- Footer de désabonnement -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
          <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
          <p>
            <a href="\${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
              Se désabonner de tous les emails
            </a>
          </p>
        </div>
      </div>
    </div>`;

    // Version texte pour améliorer la délivrabilité
    const textContent = `
✏️ L'organisateur a modifié un évènement

Bonjour ${comedian.firstName || ''},

L'évènement auquel vous avez postulé a été mis à jour par ${organizer.firstName} ${organizer.lastName}.
${changesText}

État actuel de l'évènement:
Évènement: ${event.title}
Date: ${new Date(event.date).toLocaleDateString('fr-FR')}
Lieu: ${event.location?.address || ''} ${event.location?.city ? `- ${event.location.city}` : ''}
${event.startTime ? `Heure: ${event.startTime}` : ''}

Pour confirmer si vous restez inscrit ou vous désinscrire, connectez-vous sur votre espace candidatures:
${config.frontend.url}/login?redirect=/applications

L'équipe Connect Comedy Club
    `.trim();

    const unsubscribeUrl = comedianId
      ? generateUnsubscribeUrl(comedianId.toString(), comedian.email)
      : `${config.frontend.url}/unsubscribe`;

    // Générer le html pour ce comédien spécifique avec son unsubscribeUrl
    const htmlForComedian = html.replace(/\$\{unsubscribeUrl\}/g, unsubscribeUrl);

    return sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      replyTo: organizer.email,
      to: comedian.email,
      subject,
      html: htmlForComedian,
      text: textContent,
      mailSettings: {
        sandboxMode: {
          enable: false
        }
      },
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `update-${event._id || Date.now()}`
      },
      categories: ['evenement', 'mise-a-jour'],
    });
  });

  await Promise.all(sendAll);
};

export const sendEventReminder = async (
  comedian: { email: string; firstName?: string; lastName?: string },
  event: { title: string; date: Date; location?: any; startTime?: string },
  type: 'J-3' | 'J-1' | '-2H'
) => {
  // ===== VÉRIFICATION ABONNEMENT EMAIL =====
  const comedianId = (comedian as any)._id || (comedian as any).id;
  if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
    console.log(`⏭️ Comédien ${comedian.email} est désabonné - rappel non envoyé`);
    return;
  }
  // =========================================

  const subjectMap = {
    'J-3': `⏳ Rappel J-3: "${event.title}" approche !`,
    'J-1': `📅 Rappel veille: "${event.title}" c'est demain`,
    '-2H': `⏰ Rappel: "${event.title}" commence dans 2 heures`,
  } as const;

  // Générer l'URL de désabonnement AVANT le template HTML
  const unsubscribeUrl = comedianId
    ? generateUnsubscribeUrl(comedianId.toString(), comedian.email)
    : `${config.frontend.url}/unsubscribe`;

  const html = `
  <div style="font-family: Arial, sans-serif; background: #f8f9fa; padding: 24px;">
    <div style="max-width: 600px; margin: auto; background: white; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.06); padding: 24px;">
      <h2 style="margin-top:0;">${subjectMap[type]}</h2>
      <p>Bonjour ${comedian.firstName || ''},</p>
      <p>Vous êtes <b>accepté</b> pour l'évènement <b>${event.title}</b>.</p>
      <div style="margin: 16px 0; padding: 16px; background:#e3f2fd; border-left: 4px solid #2196f3; border-radius: 8px;">
        <div><b>📅 Date:</b> ${new Date(event.date).toLocaleDateString('fr-FR')}</div>
        ${event.startTime ? `<div><b>⏰ Heure:</b> ${event.startTime}</div>` : ''}
        ${event.location ? `<div><b>📍 Lieu:</b> ${event.location.address || ''} ${event.location.city ? `- ${event.location.city}` : ''}</div>` : ''}
      </div>
      <p>Nous vous souhaitons une excellente performance !</p>
      <div style="text-align:center; margin-top: 12px;">
        <a href="${config.frontend.url}/applications" style="display:inline-block;padding:12px 24px;background:#667eea;color:#fff;border-radius:24px;text-decoration:none;font-weight:bold">Voir mes candidatures</a>
      </div>
      <p style="color:#888; margin-top:16px;">Cet email est automatique. Merci de ne pas y répondre.</p>

      <!-- Footer de désabonnement -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
        <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
        <p>
          <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
            Se désabonner de tous les emails
          </a>
        </p>
      </div>
    </div>
  </div>`;

  // Version texte pour améliorer la délivrabilité
  const textContent = `
${subjectMap[type]}

Bonjour ${comedian.firstName || ''},

Vous êtes accepté pour l'évènement ${event.title}.

Date: ${new Date(event.date).toLocaleDateString('fr-FR')}
${event.startTime ? `Heure: ${event.startTime}` : ''}
${event.location ? `Lieu: ${event.location.address || ''} ${event.location.city ? `- ${event.location.city}` : ''}` : ''}

Nous vous souhaitons une excellente performance !

Voir mes candidatures: ${config.frontend.url}/applications

L'équipe Connect Comedy Club
  `.trim();

  await sgMail.send({
    from: {
      email: config.email.smtpUser,
      name: 'Connect Comedy Club'
    },
    to: comedian.email,
    subject: subjectMap[type],
    html,
    text: textContent,
    mailSettings: {
      sandboxMode: {
        enable: false
      }
    },
    headers: {
      'List-Unsubscribe': unsubscribeUrl ? `<${unsubscribeUrl}>` : `<${config.frontend.url}/unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Entity-Ref-ID': `rappel-${type}-${Date.now()}`
    },
    categories: ['rappel', 'evenement'],
  });
};

/**
 * Envoie un email d'avertissement quand le compte est restreint (signalement en cours)
 */
export const sendComedianReportAccountRestrictedEmail = async (
  comedian: { email: string; _id?: string; id?: string; firstName?: string; lastName?: string }
) => {
  const comedianId = comedian._id || comedian.id;
  if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
    console.log(`⏭️ Comédien ${comedian.email} est désabonné - email non envoyé`);
    return;
  }
  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') return;
  if (!config.email.smtpUser || !config.email.smtpPass) return;

  const subject = 'Votre compte est restreint';
  const textContent = `Votre compte est restreint

Bonjour,

Nous vous informons que votre compte a fait l'objet d'un signalement et qu'il est temporairement restreint dans l'attente de l'examen par notre équipe.

Pendant cette période, vous ne pouvez pas postuler à de nouveaux événements. Vous serez informé par email une fois l'examen terminé.

Pour toute question, vous pouvez nous contacter à : contact@connectcomedyclub.com

Cordialement,
L'équipe Connect Comedy Club`;

  const htmlContent = `
  <div style="font-family: Arial, sans-serif; background: #f8f9fa; padding: 24px;">
    <div style="max-width: 600px; margin: auto; background: white; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.06); padding: 32px;">
      <h2 style="color: #ffc107; margin-top: 0;">Votre compte est restreint</h2>
      <p>Bonjour,</p>
      <p>Nous vous informons que votre compte a fait l'objet d'un signalement et qu'il est temporairement restreint dans l'attente de l'examen par notre équipe.</p>
      <p>Pendant cette période, vous ne pouvez pas postuler à de nouveaux événements. Vous serez informé par email une fois l'examen terminé.</p>
      <p>Pour toute question, vous pouvez nous contacter à : <a href="mailto:contact@connectcomedyclub.com">contact@connectcomedyclub.com</a></p>
      <p>Cordialement,<br/>L'équipe Connect Comedy Club</p>
    </div>
  </div>`;

  const unsubscribeUrl = comedianId
    ? generateUnsubscribeUrl(comedianId.toString(), comedian.email)
    : `${config.frontend.url}/unsubscribe`;

  await sgMail.send({
    from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
    to: comedian.email,
    subject,
    html: htmlContent,
    text: textContent,
    mailSettings: { sandboxMode: { enable: false } },
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Entity-Ref-ID': `report-restricted-${Date.now()}`
    },
    categories: ['signalement', 'restriction'],
  });
};

/**
 * Envoie un email au compte signalé quand le signalement est validé (compte désactivé)
 */
export const sendComedianReportAccountDeactivatedEmail = async (
  comedian: { email: string; _id?: string; id?: string; firstName?: string; lastName?: string }
) => {
  const comedianId = comedian._id || comedian.id;
  if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
    console.log(`⏭️ Comédien ${comedian.email} est désabonné - email non envoyé`);
    return;
  }
  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') return;
  if (!config.email.smtpUser || !config.email.smtpPass) return;

  const subject = 'Votre compte a été désactivé';
  const textContent = `Votre compte a été désactivé

Bonjour,

Suite à l'examen de votre compte, nous sommes au regret de vous informer qu'il a été désactivé et n'est plus accessible. Cette décision est définitive et votre compte est désormais inactif.

Pour toute question, vous pouvez nous contacter à l'adresse suivante : contact@connectcomedyclub.com

Cordialement,
L'équipe Connect Comedy Club`;

  const htmlContent = `
  <div style="font-family: Arial, sans-serif; background: #f8f9fa; padding: 24px;">
    <div style="max-width: 600px; margin: auto; background: white; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.06); padding: 32px;">
      <h2 style="color: #dc3545; margin-top: 0;">Votre compte a été désactivé</h2>
      <p>Bonjour,</p>
      <p>Suite à l'examen de votre compte, nous sommes au regret de vous informer qu'il a été désactivé et n'est plus accessible. Cette décision est définitive et votre compte est désormais inactif.</p>
      <p>Pour toute question, vous pouvez nous contacter à l'adresse suivante : <a href="mailto:contact@connectcomedyclub.com">contact@connectcomedyclub.com</a></p>
      <p>Cordialement,<br/>L'équipe Connect Comedy Club</p>
    </div>
  </div>`;

  const unsubscribeUrl = comedianId
    ? generateUnsubscribeUrl(comedianId.toString(), comedian.email)
    : `${config.frontend.url}/unsubscribe`;

  await sgMail.send({
    from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
    to: comedian.email,
    subject,
    html: htmlContent,
    text: textContent,
    mailSettings: { sandboxMode: { enable: false } },
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Entity-Ref-ID': `report-deactivated-${Date.now()}`
    },
    categories: ['signalement', 'desactivation'],
  });
};

/**
 * Envoie un email au compte signalé quand le signalement est rejeté (compte validé)
 */
export const sendComedianReportAccountValidatedEmail = async (
  comedian: { email: string; _id?: string; id?: string; firstName?: string; lastName?: string }
) => {
  const comedianId = comedian._id || comedian.id;
  if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
    console.log(`⏭️ Comédien ${comedian.email} est désabonné - email non envoyé`);
    return;
  }
  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') return;
  if (!config.email.smtpUser || !config.email.smtpPass) return;

  const subject = 'Votre compte a été validé avec succès';
  const loginUrl = 'https://www.connectcomedyclub.com/';
  const textContent = `Votre compte a été validé avec succès

Nous vous informons que votre compte a été examiné et validé par notre équipe. Il est désormais actif et vous pouvez accéder à l'ensemble des fonctionnalités de notre plateforme.

Pour vous connecter, rendez-vous sur ${loginUrl}.

N'hésitez pas à nous contacter si vous avez la moindre question.

Cordialement,
L'équipe Connect Comedy Club`;

  const htmlContent = `
  <div style="font-family: Arial, sans-serif; background: #f8f9fa; padding: 24px;">
    <div style="max-width: 600px; margin: auto; background: white; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.06); padding: 32px;">
      <h2 style="color: #28a745; margin-top: 0;">Votre compte a été validé avec succès</h2>
      <p>Nous vous informons que votre compte a été examiné et validé par notre équipe. Il est désormais actif et vous pouvez accéder à l'ensemble des fonctionnalités de notre plateforme.</p>
      <p>Pour vous connecter, rendez-vous sur <a href="${loginUrl}">${loginUrl}</a>.</p>
      <p>N'hésitez pas à nous contacter si vous avez la moindre question.</p>
      <p>Cordialement,<br/>L'équipe Connect Comedy Club</p>
    </div>
  </div>`;

  const unsubscribeUrl = comedianId
    ? generateUnsubscribeUrl(comedianId.toString(), comedian.email)
    : `${config.frontend.url}/unsubscribe`;

  await sgMail.send({
    from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
    to: comedian.email,
    subject,
    html: htmlContent,
    text: textContent,
    mailSettings: { sandboxMode: { enable: false } },
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Entity-Ref-ID': `report-validated-${Date.now()}`
    },
    categories: ['signalement', 'validation'],
  });
};

// Notifier les participants d'un évènement annulé (avec raison)
export const sendEventCancellationToParticipants = async (
  participants: Array<{ email: string; firstName?: string; lastName?: string }>,
  event: { title: string; date: Date; location?: any },
  organizer: { firstName: string; lastName: string; email: string },
  cancellationReason?: string
) => {
  if (!participants || participants.length === 0) return;

  const subject = `🛑 Évènement annulé: "${event.title}"`;

  const sends = participants
    .filter(p => !!p.email)
    .map(async (p) => {
      // ===== VÉRIFICATION ABONNEMENT EMAIL =====
      const participantId = (p as any)._id || (p as any).id;
      if (participantId && !(await checkUserEmailSubscription(participantId))) {
        console.log(`⏭️ Participant ${p.email} est désabonné - email non envoyé`);
        return Promise.resolve();
      }
      // =========================================

      const html = `
      <div style="font-family: Arial, sans-serif; background:#f8f9fa; padding:24px;">
        <div style="max-width: 600px; margin:auto; background:white; border-radius:12px; box-shadow:0 6px 18px rgba(0,0,0,0.06); padding:24px;">
          <h2 style="margin-top:0;color:#dc3545;">🛑 Évènement annulé</h2>
          <p>Bonjour ${p.firstName || ''}${p.lastName ? ' ' + p.lastName : ''},</p>
          <p>L'évènement <b>${event.title}</b> prévu le <b>${new Date(event.date).toLocaleDateString('fr-FR')}</b> a été <b>annulé</b> par <b>${organizer.firstName} ${organizer.lastName}</b>.</p>
          ${event.location ? `<p><b>Lieu:</b> ${event.location.address || ''} ${event.location.city ? ' - ' + event.location.city : ''}</p>` : ''}
          ${cancellationReason ? `<div style="margin:16px 0; padding:12px; background:#fff3cd; border-left:4px solid #ffc107; border-radius:8px;"><b>Raison fournie:</b><br/><i>${cancellationReason}</i></div>` : ''}
          <p>Nous vous remercions pour votre compréhension.</p>
          <p style="color:#888; margin-top:16px; font-size:0.95em;">Cet email est automatique. Merci de ne pas y répondre.</p>

          <!-- Footer de désabonnement -->
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
            <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
            <p>
              <a href="\${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
                Se désabonner de tous les emails
              </a>
            </p>
          </div>
        </div>
      </div>`;

      // Version texte pour améliorer la délivrabilité
      const textContent = `
🛑 Évènement annulé

Bonjour ${p.firstName || ''}${p.lastName ? ' ' + p.lastName : ''},

L'évènement ${event.title} prévu le ${new Date(event.date).toLocaleDateString('fr-FR')} a été annulé par ${organizer.firstName} ${organizer.lastName}.

${event.location ? `Lieu: ${event.location.address || ''} ${event.location.city ? ' - ' + event.location.city : ''}` : ''}
${cancellationReason ? `Raison: ${cancellationReason}` : ''}

Nous vous remercions pour votre compréhension.

L'équipe Connect Comedy Club
      `.trim();

      const unsubscribeUrl = participantId
        ? generateUnsubscribeUrl(participantId.toString(), p.email)
        : `${config.frontend.url}/unsubscribe`;

      // Générer le html pour ce participant spécifique avec son unsubscribeUrl
      const htmlForParticipant = html.replace(/\$\{unsubscribeUrl\}/g, unsubscribeUrl);

      return sgMail.send({
        from: {
          email: config.email.smtpUser,
          name: 'Connect Comedy Club'
        },
        replyTo: organizer.email,
        to: p.email,
        subject,
        html: htmlForParticipant,
        text: textContent,
        mailSettings: {
          sandboxMode: {
            enable: false
          }
        },
        headers: {
          'List-Unsubscribe': unsubscribeUrl ? `<${unsubscribeUrl}>` : `<${config.frontend.url}/unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Entity-Ref-ID': `annulation-${Date.now()}`
        },
        categories: ['annulation', 'evenement'],
      });
    });

  await Promise.all(sends);
};

/**
 * Envoie une relance automatique à l'organisateur pour un évènement incomplet
 *
 * Cette fonction est appelée par le système de cron pour relancer les organisateurs
 * lorsque leur évènement n'a pas atteint le quota d'humoristes ou qu'ils ont des
 * candidatures en attente de traitement.
 *
 * @param organizer - Données de l'organisateur (email, firstName, lastName)
 * @param event - Données de l'évènement concerné
 * @param daysRemaining - Nombre de jours restants avant l'évènement
 * @param currentCount - Nombre actuel de participants acceptés
 * @param targetCount - Nombre d'humoristes visé par l'organisateur
 * @param pendingApplicationsCount - Nombre de candidatures en attente
 */
export const sendOrganizerEventReminder = async (
  organizer: { email: string; firstName?: string; lastName?: string },
  event: {
    _id: any;
    title: string;
    date: Date;
    location?: any;
    startTime?: string;
  },
  daysRemaining: number,
  currentCount: number,
  targetCount: number,
  pendingApplicationsCount: number
) => {
  try {
    console.log(`📬 Envoi relance organisateur: ${organizer.email} pour évènement "${event.title}" (J-${daysRemaining})`);

    // ===== VÉRIFICATION ABONNEMENT EMAIL =====
    const organizerId = (organizer as any)._id || (organizer as any).id;
    if (organizerId && !(await checkUserEmailSubscription(organizerId))) {
      console.log(`⏭️ Organisateur ${organizer.email} est désabonné - relance non envoyée`);
      return;
    }
    // =========================================

    // Mode économie mémoire - désactiver temporairement les emails
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ 📧 Emails désactivés pour économiser la mémoire (plan gratuit)');
      return;
    }

    // Vérifier la configuration email
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante');
      return;
    }

    // Construction de l'URL frontend pour les actions
    const frontendBase = config.frontend.url;
    const eventId = event._id?.toString() || '';
    const applicationsUrl = `${frontendBase}/applications?eventId=${eventId}`;
    const editEventUrl = `${frontendBase}/events/edit/${eventId}`;
    const eventsUrl = `${frontendBase}/events`;

    // Construire le message principal selon la situation
    let mainMessage = '';
    let actionSuggestions = '';

    if (pendingApplicationsCount > 0 && currentCount < targetCount) {
      // Cas 1: Candidatures en attente ET quota non atteint
      mainMessage = `Votre évènement a lieu dans <b>${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</b> et le quota de <b>${targetCount} humoriste${targetCount > 1 ? 's' : ''}</b> n'est pas atteint (<b>${currentCount}/${targetCount}</b>). De plus, vous avez <b>${pendingApplicationsCount} candidature${pendingApplicationsCount > 1 ? 's' : ''} en attente</b> de traitement.`;
      actionSuggestions = `
        <li>📋 <b>Consulter les ${pendingApplicationsCount} candidature${pendingApplicationsCount > 1 ? 's' : ''} en attente</b> et faire votre sélection</li>
        <li>✏️ <b>Modifier le nombre d'humoristes souhaité</b> si ${targetCount} est trop ambitieux</li>
        <li>📢 <b>Envoyer un rappel</b> aux humoristes pour attirer de nouveaux candidats</li>
      `;
    } else if (pendingApplicationsCount > 0) {
      // Cas 2: Uniquement des candidatures en attente
      mainMessage = `Votre évènement a lieu dans <b>${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</b> et vous avez <b>${pendingApplicationsCount} candidature${pendingApplicationsCount > 1 ? 's' : ''} en attente</b> de traitement.`;
      actionSuggestions = `
        <li>📋 <b>Consulter les candidatures en attente</b> et faire votre sélection</li>
        <li>✅ <b>Valider les humoristes</b> qui correspondent à vos attentes</li>
      `;
    } else {
      // Cas 3: Uniquement quota non atteint
      mainMessage = `Votre évènement a lieu dans <b>${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</b> et le quota de <b>${targetCount} humoriste${targetCount > 1 ? 's' : ''}</b> n'est pas atteint (<b>${currentCount}/${targetCount}</b>).`;
      actionSuggestions = `
        <li>✏️ <b>Réduire le nombre d'humoristes souhaité</b> si ${targetCount} est trop ambitieux</li>
        <li>📢 <b>Envoyer un rappel</b> aux humoristes pour attirer de nouveaux candidats</li>
        <li>📋 <b>Consulter les candidatures</b> pour voir s'il y a des profils intéressants</li>
      `;
    }

    const subject = `⏰ J-${daysRemaining}: Action requise pour "${event.title}" (${currentCount}/${targetCount} humoristes)`;

    // Générer l'URL de désabonnement AVANT le template HTML
    const unsubscribeUrl = organizerId
      ? generateUnsubscribeUrl(organizerId.toString(), organizer.email)
      : `${config.frontend.url}/unsubscribe`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relance évènement</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #ff9800 0%, #ff5722 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
        }
        .header .subtitle {
            margin-top: 10px;
            font-size: 16px;
            opacity: 0.95;
        }
        .content {
            padding: 30px;
        }
        .alert-box {
            background: linear-gradient(135deg, #ff9800 0%, #ff5722 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
            box-shadow: 0 8px 20px rgba(255, 152, 0, 0.3);
        }
        .alert-box p {
            margin: 0;
            font-size: 16px;
            line-height: 1.5;
        }
        .event-summary {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .event-title {
            font-size: 20px;
            color: #333;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .event-details {
            display: grid;
            gap: 8px;
            color: #666;
            font-size: 14px;
        }
        .detail-item {
            display: flex;
            align-items: center;
        }
        .detail-icon {
            margin-right: 8px;
            width: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        .stat-item {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        .stat-item.warning {
            background: linear-gradient(135deg, #ff9800 0%, #ff5722 100%);
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 13px;
            opacity: 0.95;
        }
        .action-section {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .action-section h3 {
            margin: 0 0 15px 0;
            color: #856404;
            font-size: 18px;
        }
        .action-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .action-list li {
            padding: 10px 0;
            color: #856404;
            font-size: 15px;
            border-bottom: 1px solid #ffeaa7;
        }
        .action-list li:last-child {
            border-bottom: none;
        }
        .cta-buttons {
            display: grid;
            gap: 12px;
            margin: 25px 0;
        }
        .cta-button {
            display: block;
            padding: 14px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            font-size: 15px;
            text-align: center;
            transition: transform 0.2s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
        }
        .btn-primary {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            box-shadow: 0 5px 15px rgba(40, 167, 69, 0.4);
        }
        .btn-secondary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .btn-tertiary {
            background: linear-gradient(135deg, #ff9800 0%, #ff5722 100%);
            color: white;
            box-shadow: 0 5px 15px rgba(255, 152, 0, 0.4);
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 15px;
            }
            .header, .content {
                padding: 20px;
            }
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⏰ Action Requise</h1>
            <div class="subtitle">Relance pour votre évènement à venir</div>
        </div>

        <div class="content">
            <p>Bonjour <strong>${organizer.firstName || 'Organisateur'}</strong>,</p>

            <div class="alert-box">
                <p>${mainMessage}</p>
            </div>

            <div class="event-summary">
                <div class="event-title">📅 ${event.title}</div>
                <div class="event-details">
                    <div class="detail-item">
                        <span class="detail-icon">📍</span>
                        <span>${event.location?.address || ''}, ${event.location?.city || ''}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-icon">📆</span>
                        <span>${new Date(event.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    ${event.startTime ? `
                    <div class="detail-item">
                        <span class="detail-icon">⏰</span>
                        <span>${event.startTime}</span>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-item warning">
                    <div class="stat-value">${currentCount}/${targetCount}</div>
                    <div class="stat-label">Humoristes acceptés</div>
                </div>
                <div class="stat-item ${pendingApplicationsCount > 0 ? 'warning' : ''}">
                    <div class="stat-value">${pendingApplicationsCount}</div>
                    <div class="stat-label">Candidature${pendingApplicationsCount > 1 ? 's' : ''} en attente</div>
                </div>
            </div>

            <div class="action-section">
                <h3>💡 Actions suggérées</h3>
                <ul class="action-list">
                    ${actionSuggestions}
                </ul>
            </div>

            <div class="cta-buttons">
                ${pendingApplicationsCount > 0 ? `
                <a href="${applicationsUrl}" class="cta-button btn-primary">
                    📋 Voir les ${pendingApplicationsCount} candidature${pendingApplicationsCount > 1 ? 's' : ''}
                </a>
                ` : ''}
                <a href="${editEventUrl}" class="cta-button btn-secondary">
                    ✏️ Modifier l'évènement
                </a>
                <a href="${eventsUrl}" class="cta-button btn-tertiary">
                    📊 Tableau de bord
                </a>
            </div>

            <p style="text-align: center; color: #666; font-size: 14px; margin-top: 25px;">
                Connectez-vous à votre espace organisateur pour gérer votre évènement.
            </p>
        </div>

        <div class="footer">
            <p><strong>L'équipe Connect Comedy Club</strong></p>
            <p>Système de relance automatique - Ne pas répondre à cet email</p>
        </div>

        <!-- Footer de désabonnement -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
            <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
            <p>
                <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
                    Se désabonner de tous les emails
                </a>
            </p>
        </div>
    </div>
</body>
</html>
    `;

    // Version texte pour améliorer la délivrabilité
    const textContent = `
⏰ Action Requise - Relance pour votre évènement

Bonjour ${organizer.firstName || 'Organisateur'},

${mainMessage.replace(/<b>/g, '').replace(/<\/b>/g, '')}

Évènement: ${event.title}
Date: ${new Date(event.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Lieu: ${event.location?.address || ''}, ${event.location?.city || ''}
${event.startTime ? `Heure: ${event.startTime}` : ''}

Statistiques:
- Humoristes acceptés: ${currentCount}/${targetCount}
- Candidatures en attente: ${pendingApplicationsCount}

Actions suggérées:
${actionSuggestions.replace(/<li>/g, '- ').replace(/<\/li>/g, '').replace(/<b>/g, '').replace(/<\/b>/g, '')}

Liens utiles:
${pendingApplicationsCount > 0 ? `- Voir les candidatures: ${applicationsUrl}` : ''}
- Modifier l'évènement: ${editEventUrl}
- Tableau de bord: ${eventsUrl}

L'équipe Connect Comedy Club
Système de relance automatique - Ne pas répondre à cet email
    `.trim();

    // Envoi via SendGrid
    await sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      to: organizer.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      mailSettings: {
        sandboxMode: {
          enable: false
        }
      },
      headers: {
        'List-Unsubscribe': unsubscribeUrl ? `<${unsubscribeUrl}>` : `<${config.frontend.url}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `organizer-reminder-${eventId}-j${daysRemaining}-${Date.now()}`,
        'Precedence': 'bulk'
      },
      categories: ['relance', 'organisateur', `j-${daysRemaining}`],
      customArgs: {
        eventId: eventId,
        type: 'organizer_event_reminder',
        daysRemaining: daysRemaining.toString()
      }
    });

    console.log(`✅ Relance J-${daysRemaining} envoyée à ${organizer.email} pour "${event.title}"`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la relance organisateur:', error);
    console.error('🔍 Détail de l\'erreur:', error instanceof Error ? error.stack : 'Erreur inconnue');
    // Ne pas bloquer le traitement des autres relances en cas d'erreur
  }
};

/**
 * Envoie une notification email à un humoriste pour un événement
 * dans sa zone de mobilité
 *
 * @param comedian - L'humoriste à notifier
 * @param event - L'événement publié (doit être populé avec organizer)
 * @param organizer - Les infos de l'organisateur (optionnel si event est populé)
 */
export const sendEventNotificationByMobility = async (
  comedian: any,
  event: any,
  organizer?: any
): Promise<void> => {
  try {
    // Vérifier abonnement email
    if (comedian.emailSubscriptions?.globalSubscribed === false) {
      console.log(`⏭️ Humoriste ${comedian.email} est désabonné - email mobilité non envoyé`);
      return;
    }

    // Mode économie mémoire
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ Emails désactivés pour économiser la mémoire');
      return;
    }

    // Vérifier la configuration email
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante pour notification mobilité');
      return;
    }

    const comedianId = comedian._id?.toString() || comedian.id;
    const unsubscribeUrl = generateUnsubscribeUrl(comedianId, comedian.email);

    // Récupérer les infos de l'organisateur
    const organizerData = organizer || event.organizer;

    // Sujet optimisé pour éviter les filtres spam
    const subject = `Nouvel évènement dans votre zone - ${event.title} 🎤`;

    // Préparer les sections d'exigences
    const requirementItems: string[] = [];
    if (event.requirements?.duration) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Durée : <strong style="color:#000000;font-weight:bold;">${event.requirements.duration} minutes</strong></li>`
      );
    }
    if (event.requirements?.maxPerformers) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Performeurs max : <strong style="color:#000000;font-weight:bold;">${event.requirements.maxPerformers}</strong></li>`
      );
    }
    if (event.requirements?.minExperience) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Expérience min : <strong style="color:#000000;font-weight:bold;">${event.requirements.minExperience} ans</strong></li>`
      );
    }

    const requirementsSection = requirementItems.length
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#fff8e5;background:#fff8e5;border:2px solid #f0c674;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:10px;color:#000000;font-size:16px;font-weight:bold;">📋 Exigences de l'évènement</strong>
                <ul style="padding-left:20px;margin:0;list-style:disc;color:#000000;">
                  ${requirementItems.join('')}
                </ul>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const descriptionSection = event.description
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#eef5ff;background:#eef5ff;border-left:4px solid #0066cc;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:8px;color:#000000;font-size:16px;font-weight:bold;">📝 Description</strong>
                <span style="color:#000000;display:block;margin-top:6px;">${event.description}</span>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nouvel évènement dans votre zone</title>
    <style>
      body {
        margin: 0 !important;
        padding: 0 !important;
        background-color: #f2f2f2;
      }
      table {
        border-spacing: 0;
        border-collapse: collapse;
      }
      img {
        border: 0;
        line-height: 100%;
        text-decoration: none;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f2f2f2;">
    <center style="width:100%;background:#f2f2f2;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;box-shadow:0 3px 12px rgba(24,36,56,0.08);">
        <tr>
          <td style="padding:28px 24px;background:#1f1b2c;color:#ffffff;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;line-height:30px;">📍 Évènement dans votre zone</p>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#d9d6ff;">Cet évènement correspond à votre zone de mobilité.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2a41;">
                  Bonjour${comedian.firstName ? ` ${comedian.firstName}` : ''},<br/><br/>
                  Un nouvel évènement vient d'être publié dans votre zone de mobilité. Ne manquez pas cette opportunité !
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table role="presentation" width="100%" style="border:1px solid #e3e6f0;border-radius:8px;">
                    <tr>
                      <td style="padding:18px 20px;background-color:#f7f8fc;background:#f7f8fc;border-bottom:2px solid #d0d5e0;font-family:Arial,Helvetica,sans-serif;">
                        <span style="display:block;font-size:12px;letter-spacing:1.2px;color:#333333;text-transform:uppercase;font-weight:bold;">Évènement</span>
                        <strong style="display:block;margin-top:8px;font-size:22px;color:#000000;font-weight:bold;">${event.title}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 20px;background-color:#ffffff;">
                        <table role="presentation" width="100%">
                          <tr>
                            <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;font-weight:normal;">
                              <strong style="color:#000000;font-weight:bold;">📍 Adresse :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${event.location?.address || ''}, ${event.location?.city || ''}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">📅 Date :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${new Date(event.date).toLocaleDateString('fr-FR')}</span>
                            </td>
                          </tr>
                          ${event.startTime ? `
                          <tr>
                            <td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">⏰ Heure :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${event.startTime}</span>
                            </td>
                          </tr>
                          ` : ''}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              ${organizerData ? `
              <tr>
                <td>
                  <table role="presentation" width="100%" style="border:2px solid #dbe8ff;border-radius:8px;background-color:#f0f5ff;">
                    <tr>
                      <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;background-color:#f0f5ff;">
                        <strong style="display:block;font-size:16px;color:#000000;font-weight:bold;margin-bottom:8px;">👤 Organisateur</strong>
                        <span style="display:block;margin-top:6px;color:#000000;font-size:15px;">${organizerData.firstName || ''} ${organizerData.lastName || ''}</span>
                        ${organizerData.email ? `<a href="mailto:${organizerData.email}" style="display:inline-block;margin-top:10px;color:#0066cc;text-decoration:underline;font-weight:bold;font-size:14px;">📧 Contacter l'organisateur</a>` : ''}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              ` : ''}
              ${descriptionSection}
              ${requirementsSection}
              <tr>
                <td align="center" style="padding:20px 0;">
                  <a href="${config.frontend.url}/events" style="display:inline-block;padding:16px 40px;background-color:#ff5a5f;background:#ff5a5f;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;border:2px solid #ff5a5f;text-align:center;min-width:200px;">🚀 Je postule maintenant</a>
                </td>
              </tr>
              <tr>
                <td style="height:20px;font-size:20px;line-height:20px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#6c6f85;text-align:center;">
                  Connectez-vous à votre espace Connect Comedy Club pour candidater rapidement.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 24px;background:#f7f8fc;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#7b7f95;">
              Connect Comedy Club · Restez inspiré et à l'écoute des nouvelles scènes.
            </p>
          </td>
        </tr>

        <!-- Footer de désabonnement -->
        <tr>
          <td style="padding:40px 24px 20px 24px;border-top:1px solid #e0e0e0;text-align:center;">
            <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#666;">
              Vous recevez cet email car cet évènement est dans votre zone de mobilité.
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">
              <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">
                Se désabonner de tous les emails
              </a>
            </p>
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>
    `;

    // Version texte simple pour améliorer la délivrabilité
    const textContent = `
Évènement dans votre zone de mobilité !

Bonjour${comedian.firstName ? ` ${comedian.firstName}` : ''},

Un nouvel évènement vient d'être publié dans votre zone de mobilité !

${organizerData ? `Organisateur: ${organizerData.firstName || ''} ${organizerData.lastName || ''}
Email: ${organizerData.email || ''}` : ''}

Évènement: ${event.title}
Date: ${new Date(event.date).toLocaleDateString('fr-FR')}
Lieu: ${event.location?.address || ''}, ${event.location?.city || ''}
${event.startTime ? `Heure: ${event.startTime}` : ''}

${event.description ? `Description: ${event.description}` : ''}

${event.requirements ? `
Exigences:
- Durée: ${event.requirements.duration || 'Non précisé'} minutes
- Nombre maximum de performeurs: ${event.requirements.maxPerformers || 'Non précisé'}
- Expérience minimale: ${event.requirements.minExperience || 'Non précisé'} ans
` : ''}

Postulez maintenant: ${config.frontend.url}/events

---
Se désabonner: ${unsubscribeUrl}

L'équipe Connect Comedy Club
    `.trim();

    const [response] = await sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      replyTo: organizerData?.email,
      to: comedian.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      mailSettings: {
        sandboxMode: {
          enable: false
        }
      },
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `mobility-notification-${event._id}-${comedianId}-${Date.now()}`,
        'Precedence': 'bulk'
      },
      categories: ['mobility-notification', 'evenement', 'zone-mobilite'],
      customArgs: {
        eventId: event._id?.toString() || 'unknown',
        comedianId: comedianId,
        type: 'mobility_event_notification'
      }
    });

    console.log(`✅ Email mobilité envoyé à ${comedian.email} pour l'événement "${event.title}" à ${event.location?.city} [SendGrid status: ${response?.statusCode ?? 'N/A'}]`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResponse = (error as any)?.response?.body;
    const errorCode = (error as any)?.code;
    console.error(`❌ Erreur envoi email mobilité à ${comedian.email}:`, {
      message: errorMessage,
      response: errorResponse,
      code: errorCode
    });
    throw error; // Re-throw pour que Promise.allSettled puisse le capturer
  }
};

/**
 * Envoie un seul email à un humoriste pour une série d'événements récurrents (même titre/lieu, dates différentes).
 * Regroupe toutes les dates dans un seul mail pour éviter d'envoyer un email par date.
 *
 * @param comedian - L'humoriste à notifier
 * @param events - Les événements du groupe récurrent (même recurrenceGroupId)
 * @param organizer - Les infos de l'organisateur
 */
export const sendRecurringEventNotificationByMobility = async (
  comedian: any,
  events: any[],
  organizer: { firstName: string; lastName: string; email: string }
): Promise<void> => {
  if (!events || events.length === 0) return;
  const event = events[0];
  try {
    if (comedian.emailSubscriptions?.globalSubscribed === false) {
      console.log(`⏭️ Humoriste ${comedian.email} est désabonné - email récurrent non envoyé`);
      return;
    }
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ Emails désactivés pour économiser la mémoire');
      return;
    }
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante pour notification mobilité récurrente');
      return;
    }

    const comedianId = comedian._id?.toString() || comedian.id;
    const unsubscribeUrl = generateUnsubscribeUrl(comedianId, comedian.email);

    const subject = `Nouvel événement récurrent dans votre zone - ${event.title} · ${events.length} date(s) 🎤`;

    const requirementItems: string[] = [];
    if (event.requirements?.duration) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Durée : <strong style="color:#000000;font-weight:bold;">${event.requirements.duration} minutes</strong></li>`
      );
    }
    if (event.requirements?.maxPerformers) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Performeurs max : <strong style="color:#000000;font-weight:bold;">${event.requirements.maxPerformers}</strong></li>`
      );
    }
    if (event.requirements?.minExperience) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Expérience min : <strong style="color:#000000;font-weight:bold;">${event.requirements.minExperience} ans</strong></li>`
      );
    }
    const requirementsSection = requirementItems.length
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#fff8e5;background:#fff8e5;border:2px solid #f0c674;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:10px;color:#000000;font-size:16px;font-weight:bold;">📋 Exigences de l'évènement</strong>
                <ul style="padding-left:20px;margin:0;list-style:disc;color:#000000;">
                  ${requirementItems.join('')}
                </ul>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const descriptionSection = event.description
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#eef5ff;background:#eef5ff;border-left:4px solid #0066cc;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:8px;color:#000000;font-size:16px;font-weight:bold;">📝 Description</strong>
                <span style="color:#000000;display:block;margin-top:6px;">${event.description}</span>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const datesRows = events
      .map(
        (e) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e3e6f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
              ${new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
              ${e.startTime ? ` · ${e.startTime}${e.endTime ? ` – ${e.endTime}` : ''}` : ''}
            </td>
          </tr>
        `
      )
      .join('');

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Événement récurrent dans votre zone</title>
    <style>
      body { margin: 0 !important; padding: 0 !important; background-color: #f2f2f2; }
      table { border-spacing: 0; border-collapse: collapse; }
      img { border: 0; line-height: 100%; text-decoration: none; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f2f2f2;">
    <center style="width:100%;background:#f2f2f2;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;box-shadow:0 3px 12px rgba(24,36,56,0.08);">
        <tr>
          <td style="padding:28px 24px;background:#1f1b2c;color:#ffffff;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;line-height:30px;">📍 Événement récurrent dans votre zone</p>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#d9d6ff;">${events.length} date(s) correspondent à votre zone de mobilité.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2a41;">
                  Bonjour${comedian.firstName ? ` ${comedian.firstName}` : ''},<br/><br/>
                  Un nouvel événement récurrent vient d'être publié dans votre zone. Plusieurs dates sont proposées.
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table role="presentation" width="100%" style="border:1px solid #e3e6f0;border-radius:8px;">
                    <tr>
                      <td style="padding:18px 20px;background-color:#f7f8fc;background:#f7f8fc;border-bottom:2px solid #d0d5e0;font-family:Arial,Helvetica,sans-serif;">
                        <span style="display:block;font-size:12px;letter-spacing:1.2px;color:#333333;text-transform:uppercase;font-weight:bold;">Événement récurrent</span>
                        <strong style="display:block;margin-top:8px;font-size:22px;color:#000000;font-weight:bold;">${event.title}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 20px;background-color:#ffffff;">
                        <table role="presentation" width="100%">
                          <tr>
                            <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">📍 Lieu :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${event.location?.address || ''}, ${event.location?.city || ''}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">📅 Dates (${events.length}) :</strong>
                            </td>
                          </tr>
                          ${datesRows}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" width="100%" style="border:2px solid #dbe8ff;border-radius:8px;background-color:#f0f5ff;">
                    <tr>
                      <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;background-color:#f0f5ff;">
                        <strong style="display:block;font-size:16px;color:#000000;font-weight:bold;margin-bottom:8px;">👤 Organisateur</strong>
                        <span style="display:block;margin-top:6px;color:#000000;font-size:15px;">${organizer.firstName || ''} ${organizer.lastName || ''}</span>
                        ${organizer.email ? `<a href="mailto:${organizer.email}" style="display:inline-block;margin-top:10px;color:#0066cc;text-decoration:underline;font-weight:bold;font-size:14px;">📧 Contacter l'organisateur</a>` : ''}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              ${descriptionSection}
              ${requirementsSection}
              <tr>
                <td align="center" style="padding:20px 0;">
                  <a href="${config.frontend.url}/events" style="display:inline-block;padding:16px 40px;background-color:#ff5a5f;background:#ff5a5f;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;border:2px solid #ff5a5f;text-align:center;min-width:200px;">🚀 Voir les dates et postuler</a>
                </td>
              </tr>
              <tr>
                <td style="height:20px;font-size:20px;line-height:20px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#6c6f85;text-align:center;">
                  Connectez-vous à votre espace Connect Comedy Club pour candidater aux dates de votre choix.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 24px;background:#f7f8fc;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#7b7f95;">
              Connect Comedy Club · Restez inspiré et à l'écoute des nouvelles scènes.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 24px 20px 24px;border-top:1px solid #e0e0e0;text-align:center;">
            <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#666;">
              Vous recevez cet email car cet événement récurrent est dans votre zone de mobilité.
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">
              <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Se désabonner de tous les emails</a>
            </p>
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>
    `;

    const datesText = events
      .map(
        (e) =>
          `  • ${new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}${e.startTime ? ` – ${e.startTime}${e.endTime ? ` à ${e.endTime}` : ''}` : ''}`
      )
      .join('\n');

    const textContent = `
Événement récurrent dans votre zone de mobilité !

Bonjour${comedian.firstName ? ` ${comedian.firstName}` : ''},

Un nouvel événement récurrent vient d'être publié dans votre zone (${events.length} date(s)).

Organisateur: ${organizer.firstName || ''} ${organizer.lastName || ''}
Email: ${organizer.email || ''}

Évènement: ${event.title}
Lieu: ${event.location?.address || ''}, ${event.location?.city || ''}

Dates:
${datesText}

${event.description ? `Description: ${event.description}` : ''}

${event.requirements ? `Exigences: Durée ${event.requirements.duration || '?'} min, max ${event.requirements.maxPerformers || '?'} performeurs, exp. min ${event.requirements.minExperience || '?'} ans` : ''}

Voir les dates et postuler: ${config.frontend.url}/events

---
Se désabonner: ${unsubscribeUrl}

L'équipe Connect Comedy Club
    `.trim();

    await sgMail.send({
      from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
      replyTo: organizer?.email,
      to: comedian.email,
      subject,
      html: htmlContent,
      text: textContent,
      mailSettings: { sandboxMode: { enable: false } },
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `mobility-recurring-${event._id}-${comedianId}-${Date.now()}`,
        Precedence: 'bulk'
      },
      categories: ['mobility-notification', 'evenement', 'zone-mobilite', 'recurring'],
      customArgs: {
        eventId: event._id?.toString() || 'unknown',
        comedianId: comedianId,
        type: 'mobility_recurring_notification'
      }
    });

    console.log(`✅ Email récurrent (${events.length} dates) envoyé à ${comedian.email} pour "${event.title}" à ${event.location?.city}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erreur envoi email récurrent à ${comedian.email}:`, errMsg);
    throw error;
  }
};

/**
 * Envoie une invitation personnelle à un humoriste pour un événement spécifique
 * Utilisé quand un organisateur invite directement un humoriste trouvé via la recherche par zone
 *
 * @param comedian - L'humoriste à inviter
 * @param event - L'événement pour lequel l'inviter
 * @param organizer - L'organisateur qui envoie l'invitation
 */
export const sendEventInvitationToComedian = async (
  comedian: { _id: string; email: string; firstName: string; lastName: string; emailSubscriptions?: { globalSubscribed?: boolean } },
  event: any,
  organizer: { firstName: string; lastName: string; email: string }
): Promise<void> => {
  try {
    // Vérifier abonnement email
    if (comedian.emailSubscriptions?.globalSubscribed === false) {
      console.log(`⏭️ Humoriste ${comedian.email} est désabonné - invitation non envoyée`);
      return;
    }

    // Mode économie mémoire
    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ Emails désactivés pour économiser la mémoire');
      return;
    }

    // Vérifier la configuration email
    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante pour invitation');
      return;
    }

    const comedianId = comedian._id?.toString();
    const unsubscribeUrl = generateUnsubscribeUrl(comedianId, comedian.email);
    const organizerFullName = `${organizer.firstName || ''} ${organizer.lastName || ''}`.trim();

    // Sujet de l'email
    const subject = `Invitation personnelle - ${event.title} 🎤`;

    // Préparer les sections d'exigences
    const requirementItems: string[] = [];
    if (event.requirements?.duration) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Durée : <strong style="color:#000000;font-weight:bold;">${event.requirements.duration} minutes</strong></li>`
      );
    }
    if (event.requirements?.maxPerformers) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Performeurs max : <strong style="color:#000000;font-weight:bold;">${event.requirements.maxPerformers}</strong></li>`
      );
    }
    if (event.requirements?.minExperience) {
      requirementItems.push(
        `<li style="margin-bottom:6px;color:#000000;font-size:15px;">Expérience min : <strong style="color:#000000;font-weight:bold;">${event.requirements.minExperience} ans</strong></li>`
      );
    }

    const requirementsSection = requirementItems.length
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#fff8e5;background:#fff8e5;border:2px solid #f0c674;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:10px;color:#000000;font-size:16px;font-weight:bold;">📋 Exigences de l'évènement</strong>
                <ul style="padding-left:20px;margin:0;list-style:disc;color:#000000;">
                  ${requirementItems.join('')}
                </ul>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const descriptionSection = event.description
      ? `
            <tr>
              <td style="padding:18px 20px;background-color:#eef5ff;background:#eef5ff;border-left:4px solid #0066cc;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;">
                <strong style="display:block;margin-bottom:8px;color:#000000;font-size:16px;font-weight:bold;">📝 Description</strong>
                <span style="color:#000000;display:block;margin-top:6px;">${event.description}</span>
              </td>
            </tr>
            <tr>
              <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
            </tr>
          `
      : '';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invitation personnelle</title>
    <style>
      body {
        margin: 0 !important;
        padding: 0 !important;
        background-color: #f2f2f2;
      }
      table {
        border-spacing: 0;
        border-collapse: collapse;
      }
      img {
        border: 0;
        line-height: 100%;
        text-decoration: none;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f2f2f2;">
    <center style="width:100%;background:#f2f2f2;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;box-shadow:0 3px 12px rgba(24,36,56,0.08);">
        <tr>
          <td style="padding:28px 24px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#ffffff;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;line-height:30px;">✨ Invitation Personnelle</p>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#e8e4ff;">${organizerFullName} vous invite à postuler !</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2a41;">
                  Bonjour${comedian.firstName ? ` ${comedian.firstName}` : ''},<br/><br/>
                  <strong>${organizerFullName}</strong> a spécifiquement pensé à vous pour son évènement et vous invite personnellement à postuler. Ne manquez pas cette opportunité !
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table role="presentation" width="100%" style="border:1px solid #e3e6f0;border-radius:8px;">
                    <tr>
                      <td style="padding:18px 20px;background-color:#f7f8fc;background:#f7f8fc;border-bottom:2px solid #d0d5e0;font-family:Arial,Helvetica,sans-serif;">
                        <span style="display:block;font-size:12px;letter-spacing:1.2px;color:#333333;text-transform:uppercase;font-weight:bold;">Évènement</span>
                        <strong style="display:block;margin-top:8px;font-size:22px;color:#000000;font-weight:bold;">${event.title}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 20px;background-color:#ffffff;">
                        <table role="presentation" width="100%">
                          <tr>
                            <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;font-weight:normal;">
                              <strong style="color:#000000;font-weight:bold;">📍 Adresse :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${event.location?.address || ''}, ${event.location?.city || ''}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">📅 Date :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${new Date(event.date).toLocaleDateString('fr-FR')}</span>
                            </td>
                          </tr>
                          ${event.startTime ? `
                          <tr>
                            <td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;">
                              <strong style="color:#000000;font-weight:bold;">⏰ Heure :</strong><br/>
                              <span style="color:#000000;display:block;margin-top:4px;">${event.startTime}</span>
                            </td>
                          </tr>
                          ` : ''}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" width="100%" style="border:2px solid #dbe8ff;border-radius:8px;background-color:#f0f5ff;">
                    <tr>
                      <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#000000;background-color:#f0f5ff;">
                        <strong style="display:block;font-size:16px;color:#000000;font-weight:bold;margin-bottom:8px;">👤 Organisateur</strong>
                        <span style="display:block;margin-top:6px;color:#000000;font-size:15px;">${organizerFullName}</span>
                        ${organizer.email ? `<a href="mailto:${organizer.email}" style="display:inline-block;margin-top:10px;color:#0066cc;text-decoration:underline;font-weight:bold;font-size:14px;">📧 Contacter l'organisateur</a>` : ''}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td>
              </tr>
              ${descriptionSection}
              ${requirementsSection}
              <tr>
                <td align="center" style="padding:20px 0;">
                  <a href="${config.frontend.url}/events" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;text-align:center;min-width:200px;">🚀 Je postule maintenant</a>
                </td>
              </tr>
              <tr>
                <td style="height:20px;font-size:20px;line-height:20px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#6c6f85;text-align:center;">
                  Connectez-vous à votre espace Connect Comedy Club pour candidater rapidement.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 24px;background:#f7f8fc;text-align:center;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#7b7f95;">
              Connect Comedy Club · Restez inspiré et à l'écoute des nouvelles scènes.
            </p>
          </td>
        </tr>

        <!-- Footer de désabonnement -->
        <tr>
          <td style="padding:40px 24px 20px 24px;border-top:1px solid #e0e0e0;text-align:center;">
            <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#666;">
              Vous recevez cet email car un organisateur vous a invité personnellement.
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">
              <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">
                Se désabonner de tous les emails
              </a>
            </p>
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>
    `;

    // Version texte simple pour améliorer la délivrabilité
    const textContent = `
Invitation personnelle !

Bonjour${comedian.firstName ? ` ${comedian.firstName}` : ''},

${organizerFullName} a spécifiquement pensé à vous pour son évènement et vous invite personnellement à postuler !

Organisateur: ${organizerFullName}
Email: ${organizer.email || ''}

Évènement: ${event.title}
Date: ${new Date(event.date).toLocaleDateString('fr-FR')}
Lieu: ${event.location?.address || ''}, ${event.location?.city || ''}
${event.startTime ? `Heure: ${event.startTime}` : ''}

${event.description ? `Description: ${event.description}` : ''}

${event.requirements ? `
Exigences:
- Durée: ${event.requirements.duration || 'Non précisé'} minutes
- Nombre maximum de performeurs: ${event.requirements.maxPerformers || 'Non précisé'}
- Expérience minimale: ${event.requirements.minExperience || 'Non précisé'} ans
` : ''}

Postulez maintenant: ${config.frontend.url}/events

---
Se désabonner: ${unsubscribeUrl}

L'équipe Connect Comedy Club
    `.trim();

    await sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      replyTo: organizer.email,
      to: comedian.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      mailSettings: {
        sandboxMode: {
          enable: false
        }
      },
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `personal-invitation-${event._id}-${comedianId}-${Date.now()}`,
        'Precedence': 'bulk'
      },
      categories: ['personal-invitation', 'evenement', 'invitation-directe'],
      customArgs: {
        eventId: event._id?.toString() || 'unknown',
        comedianId: comedianId,
        organizerId: organizer.email,
        type: 'personal_event_invitation'
      }
    });

    console.log(`✅ Invitation personnelle envoyée à ${comedian.email} pour l'événement "${event.title}" par ${organizerFullName}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResponse = (error as any)?.response?.body;
    const errorCode = (error as any)?.code;
    console.error(`❌ Erreur envoi invitation à ${comedian.email}:`, {
      message: errorMessage,
      response: errorResponse,
      code: errorCode
    });
    throw error;
  }
};

/**
 * Envoie un email à l'organisateur pour l'informer qu'un humoriste s'est désinscrit de son événement
 * (désistement « normal », hors cas tardif < 72h)
 */
export const sendWithdrawalNotificationToOrganizer = async (
  eventData: any,
  comedianData: any,
  organizerData: any
): Promise<void> => {
  try {
    console.log('📬 Service Email: Notification désistement à l\'organisateur...');

    const organizerId = organizerData._id || organizerData.id;
    if (organizerId && !(await checkUserEmailSubscription(organizerId))) {
      console.log(`⏭️ Organisateur ${organizerData.email} est désabonné - email non envoyé`);
      return;
    }

    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true') {
      console.log('⚠️ 📧 Emails désactivés');
      return;
    }

    if (!config.email.smtpUser || !config.email.smtpPass) {
      console.error('❌ Configuration email manquante');
      return;
    }

    const comedianName = [comedianData.firstName, comedianData.lastName].filter(Boolean).join(' ') || 'Un humoriste';
    const eventDate = eventData.date
      ? new Date(eventData.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const eventTime = eventData.startTime ? eventData.startTime : '';

    const subject = `Désistement pour "${eventData.title}" - Connect Comedy Club`;
    const unsubscribeUrl = organizerId
      ? generateUnsubscribeUrl(organizerId.toString(), organizerData.email)
      : `${config.frontend.url}/unsubscribe`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Désistement</title>
  <style>
    body { margin: 0; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .content { padding: 28px; }
    .card { background: #f8f9fa; border-radius: 12px; padding: 16px; margin: 16px 0; border-left: 4px solid #667eea; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 13px; background: #f8f9fa; }
    a.btn { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Désistement d'un participant</h1>
    </div>
    <div class="content">
      <p>Bonjour ${organizerData.firstName || 'Organisateur'},</p>
      <p><strong>${comedianName}</strong> s'est désinscrit de votre événement.</p>
      <div class="card">
        <p style="margin: 0 0 8px 0;"><strong>${eventData.title || 'Événement'}</strong></p>
        ${eventDate ? `<p style="margin: 0; color: #555;">📅 ${eventDate}${eventTime ? ` à ${eventTime}` : ''}</p>` : ''}
      </div>
      <p>Une place est à nouveau disponible. Vous pouvez consulter les candidatures en attente ou les recommandations sur la plateforme.</p>
      <a href="${config.frontend.url}/my-events" class="btn">Voir mes événements</a>
    </div>
    <div class="footer">
      <p>L'équipe Connect Comedy Club</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `Bonjour ${organizerData.firstName || 'Organisateur'},

${comedianName} s'est désinscrit de votre événement "${eventData.title || 'Événement'}".
${eventDate ? `Date : ${eventDate}${eventTime ? ` à ${eventTime}` : ''}` : ''}

Une place est à nouveau disponible. Connectez-vous pour gérer vos candidatures : ${config.frontend.url}/my-events

L'équipe Connect Comedy Club`;

    await sgMail.send({
      to: organizerData.email,
      from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
      subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      categories: ['withdrawal', 'organizer']
    });

    console.log(`✅ Email de désistement envoyé à l'organisateur ${organizerData.email}`);
  } catch (error) {
    console.error('❌ Erreur envoi email désistement à l\'organisateur:', error);
  }
};

/**
 * Envoie un email à l'organisateur pour l'informer d'un désistement tardif
 * et lui indiquer que l'événement est mis en avant
 */
export const sendLateCancellationToOrganizer = async (
  eventData: any,
  comedianData: any,
  organizerData: any,
  hoursBeforeEvent: number
): Promise<void> => {
  try {
    console.log('📬 Service Email: Notification désistement tardif à l\'organisateur...');

    // Vérifier l'abonnement email
    const organizerId = organizerData._id || organizerData.id;
    if (organizerId && !(await checkUserEmailSubscription(organizerId))) {
      console.log(`⏭️ Organisateur ${organizerData.email} est désabonné - email non envoyé`);
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

    const subject = `⚠️ Désistement tardif pour "${eventData.title}" - L'événement est mis en avant`;
    const unsubscribeUrl = organizerId
      ? generateUnsubscribeUrl(organizerId.toString(), organizerData.email)
      : `${config.frontend.url}/unsubscribe`;

    const eventDate = new Date(eventData.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Désistement Tardif</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
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
        .boost-box {
            background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
            border: 2px solid #28a745;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .boost-box h3 {
            margin: 0 0 10px 0;
            color: #155724;
        }
        .comedian-card {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            padding: 20px;
            border-radius: 15px;
            margin: 20px 0;
        }
        .event-summary {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .cta-button {
            display: inline-block;
            padding: 12px 25px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 25px;
            font-weight: bold;
            margin-top: 20px;
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
            <h1>⚠️ Désistement Tardif</h1>
        </div>
        
        <div class="content">
            <div class="alert-box">
                <h2>Un humoriste s'est désisté moins de 72h avant votre événement</h2>
                <p style="margin: 10px 0 0 0; color: #856404;">
                    <strong>${hoursBeforeEvent.toFixed(1)} heures</strong> avant le début de l'événement
                </p>
            </div>

            <div class="comedian-card">
                <h3 style="margin: 0 0 10px 0;">🎭 ${comedianData.firstName} ${comedianData.lastName}</h3>
                <p style="margin: 0; opacity: 0.9;">${comedianData.email}</p>
            </div>

            <div class="event-summary">
                <h3 style="margin: 0 0 15px 0; color: #333;">📅 ${eventData.title}</h3>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
                <p style="margin: 5px 0;"><strong>Lieu:</strong> ${eventData.location?.address || 'Non spécifié'}, ${eventData.location?.city || 'Non spécifié'}</p>
            </div>

            <div class="boost-box">
                <h3>✨ Bonne nouvelle !</h3>
                <p style="margin: 0; color: #155724;">
                    Votre événement a été automatiquement <strong>mis en avant</strong> dans les recommandations des humoristes.
                    Il apparaîtra en priorité pour trouver rapidement un remplaçant.
                </p>
            </div>

            <p style="text-align: center; margin-top: 30px;">
                <a href="${config.frontend.url}/events/${eventData._id}" class="cta-button">
                    📋 Voir mon événement
                </a>
            </p>
        </div>

        <div class="footer">
            <p><strong>L'équipe Connect Comedy Club</strong></p>
            <p>Connecter les talents avec les opportunités</p>
        </div>

        <div style="margin-top: 40px; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
            <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
            <p>
                <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
                    Se désabonner de tous les emails
                </a>
            </p>
        </div>
    </div>
</body>
</html>
    `;

    const textContent = `
Désistement Tardif - ${eventData.title}

Bonjour ${organizerData.firstName},

Un humoriste s'est désisté moins de 72h avant votre événement:

Humoriste: ${comedianData.firstName} ${comedianData.lastName} (${comedianData.email})
Désistement: ${hoursBeforeEvent.toFixed(1)} heures avant l'événement

Événement: ${eventData.title}
Date: ${eventDate}
Lieu: ${eventData.location?.address || 'Non spécifié'}, ${eventData.location?.city || 'Non spécifié'}

Bonne nouvelle ! Votre événement a été automatiquement mis en avant dans les recommandations des humoristes pour trouver rapidement un remplaçant.

Voir mon événement: ${config.frontend.url}/events/${eventData._id}

L'équipe Connect Comedy Club
    `.trim();

    await sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      to: organizerData.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      categories: ['late-cancellation', 'organizer']
    });

    console.log(`✅ Email de désistement tardif envoyé à l'organisateur ${organizerData.email}`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de l\'email de désistement à l\'organisateur:', error);
  }
};

/**
 * Envoie un email à l'humoriste pour confirmer son désistement tardif
 * et l'informer de son total d'annulations tardives
 */
export const sendLateCancellationToComedian = async (
  eventData: any,
  comedianData: any,
  hoursBeforeEvent: number,
  totalLateCancellations: number
): Promise<void> => {
  try {
    console.log('📬 Service Email: Confirmation désistement tardif à l\'humoriste...');

    // Vérifier l'abonnement email
    const comedianId = comedianData._id || comedianData.id;
    if (comedianId && !(await checkUserEmailSubscription(comedianId))) {
      console.log(`⏭️ Humoriste ${comedianData.email} est désabonné - email non envoyé`);
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

    const subject = `⚠️ Confirmation de votre désistement - ${eventData.title}`;
    const unsubscribeUrl = comedianId
      ? generateUnsubscribeUrl(comedianId.toString(), comedianData.email)
      : `${config.frontend.url}/unsubscribe`;

    const eventDate = new Date(eventData.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmation de Désistement</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
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
        .warning-box {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .warning-box h3 {
            margin: 0 0 10px 0;
            color: #856404;
        }
        .event-summary {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .stats-box {
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .stats-box h3 {
            margin: 0 0 15px 0;
            color: #495057;
        }
        .stat-value {
            font-size: 48px;
            font-weight: bold;
            color: ${totalLateCancellations >= 3 ? '#dc3545' : totalLateCancellations >= 2 ? '#ffc107' : '#28a745'};
        }
        .stat-label {
            color: #6c757d;
            font-size: 14px;
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
            <h1>⚠️ Confirmation de Désistement</h1>
        </div>
        
        <div class="content">
            <p>Bonjour ${comedianData.firstName},</p>
            
            <p>Nous avons bien enregistré votre désistement pour l'événement suivant :</p>

            <div class="event-summary">
                <h3 style="margin: 0 0 15px 0; color: #333;">📅 ${eventData.title}</h3>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
                <p style="margin: 5px 0;"><strong>Lieu:</strong> ${eventData.location?.address || 'Non spécifié'}, ${eventData.location?.city || 'Non spécifié'}</p>
            </div>

            <div class="warning-box">
                <h3>⚠️ Attention - Désistement tardif</h3>
                <p style="margin: 0; color: #856404;">
                    Votre désistement a été effectué <strong>${hoursBeforeEvent.toFixed(1)} heures</strong> avant le début de l'événement.
                    Un désistement à moins de 72h est considéré comme tardif.
                </p>
            </div>

            <div class="stats-box">
                <h3>Vos annulations tardives</h3>
                <div class="stat-value">${totalLateCancellations}</div>
                <div class="stat-label">au total</div>
                <p style="margin-top: 15px; color: #6c757d; font-size: 14px;">
                    ${totalLateCancellations >= 3 
                      ? '⚠️ Votre nombre d\'annulations tardives est élevé. Pour maintenir votre réputation, nous vous recommandons d\'être plus vigilant sur vos engagements.' 
                      : totalLateCancellations >= 2 
                        ? '💡 Attention, vous avez déjà plusieurs annulations tardives. Pensez à bien vérifier vos disponibilités avant d\'accepter une candidature.' 
                        : '✅ Continuez à respecter vos engagements pour maintenir une bonne réputation sur la plateforme.'}
                </p>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                L'organisateur a été notifié et l'événement a été mis en avant pour trouver rapidement un remplaçant.
            </p>
        </div>

        <div class="footer">
            <p><strong>L'équipe Connect Comedy Club</strong></p>
            <p>Connecter les talents avec les opportunités</p>
        </div>

        <div style="margin-top: 40px; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
            <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
            <p>
                <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
                    Se désabonner de tous les emails
                </a>
            </p>
        </div>
    </div>
</body>
</html>
    `;

    const textContent = `
Confirmation de Désistement - ${eventData.title}

Bonjour ${comedianData.firstName},

Nous avons bien enregistré votre désistement pour l'événement suivant :

Événement: ${eventData.title}
Date: ${eventDate}
Lieu: ${eventData.location?.address || 'Non spécifié'}, ${eventData.location?.city || 'Non spécifié'}

⚠️ Attention - Désistement tardif
Votre désistement a été effectué ${hoursBeforeEvent.toFixed(1)} heures avant le début de l'événement.
Un désistement à moins de 72h est considéré comme tardif.

Vos annulations tardives: ${totalLateCancellations} au total

${totalLateCancellations >= 3 
  ? '⚠️ Votre nombre d\'annulations tardives est élevé. Pour maintenir votre réputation, nous vous recommandons d\'être plus vigilant sur vos engagements.' 
  : totalLateCancellations >= 2 
    ? '💡 Attention, vous avez déjà plusieurs annulations tardives. Pensez à bien vérifier vos disponibilités avant d\'accepter une candidature.' 
    : '✅ Continuez à respecter vos engagements pour maintenir une bonne réputation sur la plateforme.'}

L'organisateur a été notifié et l'événement a été mis en avant pour trouver rapidement un remplaçant.

L'équipe Connect Comedy Club
    `.trim();

    await sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      to: comedianData.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      categories: ['late-cancellation', 'comedian']
    });

    console.log(`✅ Email de confirmation de désistement envoyé à l'humoriste ${comedianData.email}`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de l\'email de désistement à l\'humoriste:', error);
  }
};

/**
 * Envoie un email urgent aux humoristes pour les informer qu'une place est disponible
 * suite à un désistement tardif
 */
export const sendUrgentAvailabilityToComedians = async (
  eventData: any,
  organizerData: any,
  comedianEmails: string[],
  isFollowUpNotification: boolean = false
): Promise<void> => {
  try {
    console.log(`📬 Service Email: Notification place disponible à ${comedianEmails.length} humoristes...`);

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

    if (comedianEmails.length === 0) {
      console.log('⚠️ Aucun humoriste à notifier');
      return;
    }

    // Adapter le sujet et le contenu selon le type de notification
    const subject = isFollowUpNotification
      ? `🔥 NOUVELLE place disponible ! - ${eventData.title}`
      : `🔥 Place disponible en urgence - ${eventData.title}`;

    const eventDate = new Date(eventData.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const eventTime = eventData.startTime || 'Heure non spécifiée';

    // Adapter le titre et le message selon le type de notification
    const headerTitle = isFollowUpNotification
      ? '🔥 NOUVELLE Place Disponible !'
      : '🔥 Place Disponible en Urgence !';
    const urgencyTitle = isFollowUpNotification
      ? 'Encore une place libérée !'
      : 'Un humoriste s\'est désisté !';
    const urgencyText = isFollowUpNotification
      ? 'Une <strong>NOUVELLE</strong> place vient de se libérer ! Il y a maintenant plusieurs opportunités sur cet événement.'
      : 'Une place vient de se libérer sur cet événement. <strong>Postulez rapidement</strong> pour maximiser vos chances d\'être sélectionné.';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Place disponible en urgence</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #ff4757 0%, #ff6348 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
        }
        .urgent-badge {
            display: inline-block;
            background: #fff;
            color: #ff4757;
            padding: 8px 20px;
            border-radius: 25px;
            font-weight: bold;
            font-size: 14px;
            margin-top: 10px;
            text-transform: uppercase;
        }
        .content {
            padding: 30px;
        }
        .urgency-box {
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            border: 3px solid #ff4757;
            border-radius: 12px;
            padding: 25px;
            margin: 20px 0;
            text-align: center;
        }
        .urgency-box h2 {
            margin: 0 0 10px 0;
            color: #c0392b;
            font-size: 24px;
        }
        .urgency-box p {
            margin: 0;
            color: #8b4513;
            font-size: 16px;
        }
        .event-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }
        .event-card h3 {
            margin: 0 0 15px 0;
            font-size: 22px;
        }
        .event-details {
            margin-top: 15px;
        }
        .event-details p {
            margin: 8px 0;
            opacity: 0.95;
        }
        .organizer-info {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .cta-button {
            display: inline-block;
            padding: 18px 40px;
            background: linear-gradient(135deg, #ff4757 0%, #ff6348 100%);
            color: white;
            text-decoration: none;
            border-radius: 30px;
            font-weight: bold;
            font-size: 18px;
            margin: 30px 0;
            box-shadow: 0 10px 30px rgba(255, 71, 87, 0.4);
            transition: transform 0.2s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
        }
        .advantages {
            background: #e8f5e9;
            border-left: 5px solid #4caf50;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 12px 12px 0;
        }
        .advantages h4 {
            margin: 0 0 10px 0;
            color: #2e7d32;
        }
        .advantages ul {
            margin: 0;
            padding-left: 20px;
            color: #388e3c;
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
            <h1>${headerTitle}</h1>
            <div class="urgent-badge">⚡ Opportunité immédiate</div>
        </div>
        
        <div class="content">
            <div class="urgency-box">
                <h2>${urgencyTitle}</h2>
                <p>${urgencyText}</p>
            </div>

            <div class="event-card">
                <h3>🎭 ${eventData.title}</h3>
                <div class="event-details">
                    <p>📅 <strong>${eventDate}</strong></p>
                    <p>⏰ ${eventTime}</p>
                    <p>📍 ${eventData.location?.city || 'Lieu non spécifié'}</p>
                    ${eventData.location?.venue ? `<p>🏢 ${eventData.location.venue}</p>` : ''}
                </div>
            </div>

            ${organizerData ? `
            <div class="organizer-info">
                <h4 style="margin: 0 0 10px 0; color: #333;">Organisateur</h4>
                <p style="margin: 0; color: #666;">
                    ${organizerData.firstName} ${organizerData.lastName}
                    ${organizerData.organizerProfile?.companyName ? ` - ${organizerData.organizerProfile.companyName}` : ''}
                </p>
            </div>
            ` : ''}

            <div class="advantages">
                <h4>✅ Pourquoi postuler maintenant ?</h4>
                <ul>
                    <li><strong>Place en priorité</strong> : L'événement est boosté dans les recommandations</li>
                    <li><strong>Moins de concurrence</strong> : Moins de candidatures que d'habitude</li>
                    <li><strong>Visibilité maximale</strong> : L'organisateur cherche activement un remplaçant</li>
                </ul>
            </div>

            <p style="text-align: center;">
                <a href="${config.frontend.url}/events/${eventData._id}" class="cta-button">
                    🚀 Postuler maintenant
                </a>
            </p>

            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 20px;">
                ⏱️ Cette opportunité est limitée dans le temps. Ne tardez pas !
            </p>
        </div>

        <div class="footer">
            <p><strong>L'équipe Connect Comedy Club</strong></p>
            <p>Connecter les talents avec les opportunités</p>
        </div>

        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
            <p>Vous recevez cet email car vous êtes inscrit sur Connect Comedy Club.</p>
        </div>
    </div>
</body>
</html>
    `;

    const textTitle = isFollowUpNotification
      ? '🔥 NOUVELLE PLACE DISPONIBLE !'
      : '🔥 PLACE DISPONIBLE EN URGENCE !';
    const textMessage = isFollowUpNotification
      ? 'Encore une place libérée ! Il y a maintenant plusieurs opportunités sur cet événement.'
      : 'Un humoriste s\'est désisté ! Une place vient de se libérer sur cet événement.';

    const textContent = `
${textTitle}

${textMessage}
Postulez rapidement pour maximiser vos chances.

🎭 ${eventData.title}
📅 ${eventDate}
⏰ ${eventTime}
📍 ${eventData.location?.city || 'Lieu non spécifié'}

POURQUOI POSTULER MAINTENANT ?
- Place en priorité : L'événement est boosté dans les recommandations
- Moins de concurrence : Moins de candidatures que d'habitude  
- Visibilité maximale : L'organisateur cherche activement un remplaçant

POSTULER : ${config.frontend.url}/events/${eventData._id}

⏱️ Cette opportunité est limitée dans le temps. Ne tardez pas !

L'équipe Connect Comedy Club
    `.trim();

    // Envoyer à tous les humoristes en BCC pour ne pas exposer les emails
    await sgMail.send({
      from: {
        email: config.email.smtpUser,
        name: 'Connect Comedy Club'
      },
      to: config.email.smtpUser,
      bcc: comedianEmails,
      subject: subject,
      html: htmlContent,
      text: textContent,
      categories: ['urgent', 'late-cancellation', 'opportunity']
    });

    console.log(`✅ Email urgent envoyé à ${comedianEmails.length} humoristes pour l'événement "${eventData.title}"`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de l\'email urgent aux humoristes:', error);
  }
};

/**
 * Email récapitulatif quotidien pour les spectateurs (événements dans leur rayon).
 * Max 1 envoi par jour (géré par l'appelant avec lastDailyRecapAt).
 */
export const sendDailySpectatorRecapEmail = async (
  spectator: { email: string; firstName?: string; lastName?: string },
  events: Array<{ title?: string; date?: Date; location?: { city?: string } }>
): Promise<void> => {
  if (!config.email.smtpUser || !config.email.smtpPass) {
    console.warn('📧 Email non configuré, récap spectateur ignoré');
    return;
  }

  const name = [spectator.firstName, spectator.lastName].filter(Boolean).join(' ') || 'Spectateur';
  const eventList = events
    .slice(0, 20)
    .map(
      (e) =>
        `• ${e.title || 'Événement'} - ${e.date ? new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}${e.location?.city ? ` (${e.location.city})` : ''}`
    )
    .join('\n');

  const htmlContent = `
    <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);padding:24px;font-family:Arial,sans-serif;">
      <h2 style="color:#1a1a2e;margin-bottom:16px;">Récap des événements près de chez vous</h2>
      <p style="color:#444;">Bonjour ${name},</p>
      <p style="color:#444;">Voici les nouveaux événements dans votre rayon ces dernières 24h :</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;white-space:pre-line;font-size:14px;">${eventList}</div>
      <p style="color:#444;">
        <a href="${config.frontend.url}/spectateur" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#FF5A7E,#FF7A92);color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Voir sur l'accueil</a>
      </p>
      <p style="color:#888;font-size:12px;">Connect Comedy Club – 1 récap par jour maximum.</p>
    </div>
  `.trim();

  await sgMail.send({
    from: { email: config.email.smtpUser, name: 'Connect Comedy Club' },
    to: spectator.email,
    subject: `Récap : ${events.length} événement(s) près de chez vous`,
    html: htmlContent,
    categories: ['spectator-recap', 'evenement'],
  });
};