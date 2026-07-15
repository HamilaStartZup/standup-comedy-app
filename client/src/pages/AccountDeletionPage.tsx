import { type CSSProperties, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TableOfContents, { type TocSection } from '../components/TableOfContents';

function AccountDeletionPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const sections: TocSection[] = [
    { id: 'depuis-app', title: '1. Supprimer votre compte depuis l\'application', level: 'h2' },
    { id: 'par-email', title: '2. Supprimer votre compte par email', level: 'h2' },
    { id: 'delai', title: '3. Délai et confirmation', level: 'h2' },
    { id: 'donnees-supprimees', title: '4. Données supprimées', level: 'h2' },
    { id: 'donnees-conservees', title: '5. Données conservées', level: 'h2' },
    { id: 'contact', title: '6. Contact', level: 'h2' },
  ];

  const pageStyle: CSSProperties = {
    minHeight: '100vh',
    background: 'var(--ccc-bg-gradient)',
    color: 'var(--ccc-text-primary)',
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
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    padding: '40px',
    borderRadius: '15px',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    flex: 1,
    minWidth: 0,
  };

  const headingStyle: CSSProperties = {
    marginBottom: '24px',
    fontSize: '2.5em',
    color: 'var(--ccc-accent)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  };

  const sectionTitleStyle: CSSProperties = {
    color: 'var(--ccc-accent)',
    marginTop: '32px',
    marginBottom: '16px',
    fontSize: '1.3em',
  };

  const textStyle: CSSProperties = {
    color: 'var(--ccc-text-secondary)',
    lineHeight: '1.7',
    marginBottom: '12px',
  };

  const listStyle: CSSProperties = {
    color: 'var(--ccc-text-secondary)',
    lineHeight: '1.7',
    marginBottom: '12px',
    paddingLeft: '20px',
  };

  const linkStyle: CSSProperties = {
    color: 'var(--ccc-accent)',
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
        <TableOfContents sections={sections} />

        <div style={containerStyle}>
          <Link to="/" style={backLinkStyle}>&larr; Retour à l'accueil</Link>

          <h1 style={headingStyle}>Suppression de compte</h1>

          <p style={textStyle}>
            Cette page explique comment supprimer votre compte Connect Comedy Club et les données
            personnelles qui y sont associées, quel que soit votre profil (spectateur, comédien, organisateur
            ou lieu). La suppression est gratuite et peut être demandée à tout moment.
          </p>

          <h2 id="depuis-app" style={sectionTitleStyle}>1. Supprimer votre compte depuis l'application</h2>
          <p style={textStyle}>
            La façon la plus simple de supprimer votre compte est directement depuis l'application
            (mobile ou web) :
          </p>
          <ul style={listStyle}>
            <li>Connectez-vous à votre compte.</li>
            <li>Ouvrez votre <strong>Profil</strong>.</li>
            <li>Rendez-vous dans la section <strong>« Supprimer mon compte »</strong> en bas de la page.</li>
            <li>Confirmez la demande de suppression.</li>
          </ul>

          <h2 id="par-email" style={sectionTitleStyle}>2. Supprimer votre compte par email</h2>
          <p style={textStyle}>
            Si vous ne parvenez pas à accéder à votre compte, vous pouvez demander sa suppression en
            écrivant à{' '}
            <a href="mailto:contact@connectcomedyclub.com" style={linkStyle}>contact@connectcomedyclub.com</a>{' '}
            depuis l'adresse email associée à votre compte, avec pour objet « Suppression de compte ».
          </p>

          <h2 id="delai" style={sectionTitleStyle}>3. Délai et confirmation</h2>
          <p style={textStyle}>
            Dès la validation de votre demande, votre compte est <strong>immédiatement désactivé</strong> :
            votre profil est masqué et le compte n'est plus utilisable normalement.
          </p>
          <p style={textStyle}>
            Vos données personnelles sont ensuite <strong>définitivement supprimées dans un délai de 30 jours</strong>.
            Pendant les 30 jours, vous pouvez <strong>annuler la suppression</strong> en vous reconnectant :
            votre compte est alors automatiquement réactivé. À l'issue de ce délai, la suppression est irréversible.
          </p>

          <h2 id="donnees-supprimees" style={sectionTitleStyle}>4. Données supprimées</h2>
          <p style={textStyle}>
            Lors de la suppression définitive, les données suivantes sont effacées de nos serveurs :
          </p>
          <ul style={listStyle}>
            <li>Votre compte et votre profil (nom, prénom, email, téléphone, biographie, photo, liens réseaux sociaux, informations professionnelles) ;</li>
            <li>Vos notifications ;</li>
            <li>Vos demandes de réinitialisation de mot de passe ;</li>
            <li><strong>Comédiens :</strong> vos candidatures, vos absences, vos alertes de présence, les signalements vous concernant, et votre retrait des listes de favoris des organisateurs ;</li>
            <li><strong>Organisateurs :</strong> les événements que vous avez créés, ainsi que les candidatures et absences associées à ces événements ;</li>
            <li><strong>Spectateurs :</strong> vos évaluations et notes d'événements et de comédiens ;</li>
            <li><strong>Lieux :</strong> les salles / établissements que vous avez enregistrés, ainsi que leurs réservations et périodes d'indisponibilité.</li>
          </ul>

          <h2 id="donnees-conservees" style={sectionTitleStyle}>5. Données conservées</h2>
          <p style={textStyle}>
            Certaines données peuvent être conservées au-delà de 30 jours <strong>uniquement lorsque la loi
            l'exige</strong> (par exemple obligations comptables ou de facturation, ou pour répondre à une
            obligation légale). Ces données sont conservées pendant la seule durée légale de conservation, puis
            supprimées. Aucune de ces données n'est utilisée à d'autres fins.
          </p>
          <p style={textStyle}>
            En particulier, les <strong>factures des réservations de salle</strong> (montants, dates, identités
            légales des parties) sont conservées le temps de la durée légale comptable, même après la suppression
            de votre compte, puis supprimées.
          </p>

          <h2 id="contact" style={sectionTitleStyle}>6. Contact</h2>
          <p style={textStyle}>
            Pour toute question relative à la suppression de votre compte ou à l'exercice de vos droits sur
            vos données personnelles, contactez-nous à{' '}
            <a href="mailto:contact@connectcomedyclub.com" style={linkStyle}>contact@connectcomedyclub.com</a>.
            Pour plus d'informations, consultez notre{' '}
            <Link to="/politique-confidentialite" style={linkStyle}>Politique de confidentialité</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AccountDeletionPage;
