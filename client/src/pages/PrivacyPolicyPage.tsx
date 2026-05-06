import { type CSSProperties, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TableOfContents, { type TocSection } from '../components/TableOfContents';

function PrivacyPolicyPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const privacyPolicySections: TocSection[] = [
    { id: 'responsable', title: '1. Responsable du traitement', level: 'h2' },
    { id: 'donnees-collectees', title: '2. Données personnelles collectées', level: 'h2' },
    { id: 'finalites', title: '3. Finalités du traitement', level: 'h2' },
    { id: 'base-legale', title: '4. Base légale du traitement', level: 'h2' },
    { id: 'duree-conservation', title: '5. Durée de conservation', level: 'h2' },
    { id: 'destinataires', title: '6. Destinataires des données', level: 'h2' },
    { id: 'transferts-ue', title: '7. Transferts hors Union Européenne', level: 'h2' },
    { id: 'vos-droits', title: '8. Vos droits', level: 'h2' },
    { id: 'reclamation-cnil', title: '9. Réclamation auprès de la CNIL', level: 'h2' },
    { id: 'cookies', title: '10. Cookies', level: 'h2' },
    { id: 'securite', title: '11. Sécurité des données', level: 'h2' },
    { id: 'modification-politique', title: '12. Modification de la politique', level: 'h2' },
  ];

  const pageStyle: CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    backgroundImage: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    padding: '40px 20px',
  };

  const wrapperStyle: CSSProperties = {
    display: 'flex',
    gap: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0',
  };

  const containerStyle: CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: '40px',
    borderRadius: '15px',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
    flex: 1,
    minWidth: 0,
  };

  const headingStyle: CSSProperties = {
    color: '#FF5A7E',
    marginBottom: '24px',
    fontSize: '2em',
  };

  const sectionTitleStyle: CSSProperties = {
    color: '#FF5A7E',
    marginTop: '32px',
    marginBottom: '16px',
    fontSize: '1.3em',
  };

  const textStyle: CSSProperties = {
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: '1.7',
    marginBottom: '12px',
  };

  const listStyle: CSSProperties = {
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: '1.7',
    marginBottom: '12px',
    paddingLeft: '20px',
  };

  const linkStyle: CSSProperties = {
    color: '#ff416c',
    textDecoration: 'none',
    fontWeight: 'bold',
  };

  const backLinkStyle: CSSProperties = {
    ...linkStyle,
    display: 'inline-block',
    marginBottom: '24px',
  };

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle}>
        <TableOfContents sections={privacyPolicySections} />

        <div style={containerStyle}>
          <Link to="/" style={backLinkStyle}>&larr; Retour à l'accueil</Link>

          <h1 style={headingStyle}>Politique de Confidentialité</h1>

          <p style={textStyle}>
            La présente politique de confidentialité définit et vous informe de la manière dont Connect Comedy Club
            utilise et protège les informations que vous nous transmettez, le cas échéant, lorsque vous utilisez
            notre site et nos services.
          </p>

          <h2 id="responsable" style={sectionTitleStyle}>1. Responsable du traitement</h2>
        <p style={textStyle}>
          <strong>Connect Comedy Club</strong><br />
          Adresse : 23 AVENUE CLEMENT ADER 78190 TRAPPES<br />
          Email : contact@connectcomedyclub.com
        </p>

        <h2 id="donnees-collectees" style={sectionTitleStyle}>2. Données personnelles collectées</h2>
        <p style={textStyle}>Nous collectons les données suivantes :</p>
        <ul style={listStyle}>
          <li><strong>Données d'identification :</strong> nom, prénom, adresse email, numéro de téléphone</li>
          <li><strong>Données de localisation :</strong> ville, adresse, code postal</li>
          <li><strong>Données de profil :</strong> biographie, photo de profil, liens vers les réseaux sociaux (Instagram, TikTok, YouTube, Facebook, Twitter)</li>
          <li><strong>Données professionnelles (comédiens) :</strong> expérience, spécialités, styles de comédie, langues</li>
          <li><strong>Données professionnelles (organisateurs) :</strong> nom de l'entreprise, site web, types de venues</li>
          <li><strong>Données de connexion :</strong> adresse IP, données de navigation</li>
        </ul>

        <h2 id="finalites" style={sectionTitleStyle}>3. Finalités du traitement</h2>
        <p style={textStyle}>Vos données sont collectées pour :</p>
        <ul style={listStyle}>
          <li>La création et la gestion de votre compte utilisateur</li>
          <li>La mise en relation entre comédiens et organisateurs d'événements</li>
          <li>L'envoi de notifications relatives aux événements et candidatures</li>
          <li>L'amélioration de nos services et de l'expérience utilisateur</li>
          <li>Le respect de nos obligations légales</li>
        </ul>

        <h2 id="base-legale" style={sectionTitleStyle}>4. Base légale du traitement</h2>
        <p style={textStyle}>Le traitement de vos données repose sur :</p>
        <ul style={listStyle}>
          <li><strong>Votre consentement :</strong> lors de votre inscription et pour l'envoi de communications</li>
          <li><strong>L'exécution du contrat :</strong> pour la fourniture de nos services</li>
          <li><strong>L'intérêt légitime :</strong> pour l'amélioration de nos services et la prévention des fraudes</li>
        </ul>

        <h2 id="duree-conservation" style={sectionTitleStyle}>5. Durée de conservation</h2>
        <p style={textStyle}>
          Vos données personnelles sont conservées pendant toute la durée de votre inscription sur la plateforme.
          En cas de suppression de votre compte, vos données seront supprimées dans un délai de 30 jours,
          à l'exception des données que nous sommes tenus de conserver pour des raisons légales.
        </p>

        <h2 id="destinataires" style={sectionTitleStyle}>6. Destinataires des données</h2>
        <p style={textStyle}>Vos données peuvent être communiquées à :</p>
        <ul style={listStyle}>
          <li>Notre personnel autorisé</li>
          <li>Nos sous-traitants techniques (hébergement, envoi d'emails)</li>
          <li>Les autres utilisateurs de la plateforme (dans le cadre des profils publics)</li>
        </ul>

        <h2 id="transferts-ue" style={sectionTitleStyle}>7. Transferts hors Union Européenne</h2>
        <p style={textStyle}>
          Certains de nos sous-traitants peuvent être situés hors de l'Union Européenne.
          Dans ce cas, nous nous assurons que des garanties appropriées sont mises en place
          conformément au RGPD (clauses contractuelles types, décision d'adéquation).
        </p>

        <h2 id="vos-droits" style={sectionTitleStyle}>8. Vos droits</h2>
        <p style={textStyle}>
          Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :
        </p>
        <ul style={listStyle}>
          <li><strong>Droit d'accès :</strong> obtenir une copie de vos données personnelles</li>
          <li><strong>Droit de rectification :</strong> corriger vos données inexactes ou incomplètes</li>
          <li><strong>Droit à l'effacement :</strong> demander la suppression de vos données</li>
          <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré</li>
          <li><strong>Droit d'opposition :</strong> vous opposer au traitement de vos données</li>
          <li><strong>Droit de retirer votre consentement :</strong> à tout moment, sans affecter la licéité du traitement antérieur</li>
          <li><strong>Droit de limitation :</strong> limiter le traitement de vos données dans certains cas</li>
        </ul>
        <p style={textStyle}>
          Pour exercer ces droits, contactez-nous à : <strong>[email à compléter]</strong>
        </p>

        <h2 id="reclamation-cnil" style={sectionTitleStyle}>9. Réclamation auprès de la CNIL</h2>
        <p style={textStyle}>
          Si vous estimez que le traitement de vos données personnelles constitue une violation du RGPD,
          vous avez le droit d'introduire une réclamation auprès de la Commission Nationale de l'Informatique
          et des Libertés (CNIL) :{' '}
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            www.cnil.fr
          </a>
        </p>

        <h2 id="cookies" style={sectionTitleStyle}>10. Cookies</h2>
        <p style={textStyle}>
          Notre site utilise des cookies pour améliorer votre expérience de navigation.
          Les cookies sont de petits fichiers texte stockés sur votre appareil.
        </p>
        <p style={textStyle}>Types de cookies utilisés :</p>
        <ul style={listStyle}>
          <li><strong>Cookies essentiels :</strong> nécessaires au fonctionnement du site (authentification)</li>
          <li><strong>Cookies de performance :</strong> pour analyser l'utilisation du site</li>
        </ul>
        <p style={textStyle}>
          Vous pouvez configurer votre navigateur pour refuser les cookies ou être alerté lorsqu'un cookie est envoyé.
        </p>

        <h2 id="securite" style={sectionTitleStyle}>11. Sécurité des données</h2>
        <p style={textStyle}>
          Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données :
        </p>
        <ul style={listStyle}>
          <li>Chiffrement des mots de passe</li>
          <li>Connexion sécurisée (HTTPS)</li>
          <li>Accès restreint aux données personnelles</li>
        </ul>

        <h2 id="modification-politique" style={sectionTitleStyle}>12. Modification de la politique</h2>
        <p style={textStyle}>
          Nous nous réservons le droit de modifier cette politique de confidentialité à tout moment.
          Les modifications prendront effet dès leur publication sur cette page.
          Nous vous encourageons à consulter régulièrement cette page.
        </p>

        {/* <p style={{ ...textStyle, marginTop: '40px', fontStyle: 'italic', color: 'rgba(255,255,255,0.6)' }}>
          Dernière mise à jour : [À compléter avec une date fixe]
        </p> */}
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;
