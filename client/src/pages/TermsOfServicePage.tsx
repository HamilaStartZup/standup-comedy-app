import { type CSSProperties, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TableOfContents, { type TocSection } from '../components/TableOfContents';

function TermsOfServicePage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const termsOfServiceSections: TocSection[] = [
    { id: 'objet', title: '1. Objet', level: 'h2' },
    { id: 'inscription', title: '2. Inscription et compte utilisateur', level: 'h2' },
    { id: 'types-comptes', title: '3. Types de comptes', level: 'h2' },
    { id: 'obligations', title: '4. Obligations des utilisateurs', level: 'h2' },
    { id: 'contenu-utilisateur', title: '5. Contenu utilisateur', level: 'h2' },
    { id: 'propriete-intellectuelle', title: '6. Propriété intellectuelle', level: 'h2' },
    { id: 'responsabilite', title: '7. Responsabilité', level: 'h2' },
    { id: 'tarification', title: '8. Tarification', level: 'h2' },
    { id: 'suspension-resiliation', title: '9. Suspension et résiliation', level: 'h2' },
    { id: 'protection-donnees', title: '10. Protection des données', level: 'h2' },
    { id: 'modification-cgu', title: '11. Modification des CGU', level: 'h2' },
    { id: 'droit-applicable', title: '12. Droit applicable et juridiction', level: 'h2' },
    { id: 'mediation', title: '13. Médiation des litiges', level: 'h2' },
    { id: 'force-majeure', title: '14. Force majeure', level: 'h2' },
    { id: 'contact', title: '15. Contact', level: 'h2' },
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
        <TableOfContents sections={termsOfServiceSections} />

        <div style={containerStyle}>
          <Link to="/" style={backLinkStyle}>&larr; Retour à l'accueil</Link>

          <h1 style={headingStyle}>Conditions Générales d'Utilisation</h1>

          <p style={textStyle}>
            Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme
            Connect Comedy Club. En accédant ou en utilisant notre service, vous acceptez d'être lié par ces conditions.
          </p>

          <h2 id="objet" style={sectionTitleStyle}>1. Objet</h2>
        <p style={textStyle}>
          Connect Comedy Club est une plateforme de mise en relation entre comédiens (humoristes) et
          organisateurs d'événements de stand-up comedy. Le service permet aux comédiens de trouver des
          opportunités de spectacles et aux organisateurs de recruter des talents pour leurs événements.
        </p>

        <h2 id="inscription" style={sectionTitleStyle}>2. Inscription et compte utilisateur</h2>
        <p style={textStyle}>
          Pour utiliser les services de Connect Comedy Club, vous devez créer un compte en fournissant
          des informations exactes et complètes. Vous êtes responsable de :
        </p>
        <ul style={listStyle}>
          <li>La confidentialité de vos identifiants de connexion</li>
          <li>Toutes les activités effectuées depuis votre compte</li>
          <li>La mise à jour de vos informations personnelles</li>
        </ul>
        <p style={textStyle}>
          Vous devez être âgé d'au moins 18 ans pour créer un compte.
        </p>

        <h2 id="types-comptes" style={sectionTitleStyle}>3. Types de comptes</h2>
        <p style={textStyle}><strong>Compte Comédien :</strong></p>
        <ul style={listStyle}>
          <li>Création d'un profil professionnel</li>
          <li>Consultation des événements disponibles</li>
          <li>Candidature aux événements</li>
          <li>Gestion de son calendrier de disponibilités</li>
        </ul>
        <p style={textStyle}><strong>Compte Organisateur :</strong></p>
        <ul style={listStyle}>
          <li>Publication d'événements</li>
          <li>Consultation des profils de comédiens</li>
          <li>Gestion des candidatures reçues</li>
          <li>Communication avec les comédiens sélectionnés</li>
        </ul>

        <h2 id="obligations" style={sectionTitleStyle}>4. Obligations des utilisateurs</h2>
        <p style={textStyle}>En utilisant Connect Comedy Club, vous vous engagez à :</p>
        <ul style={listStyle}>
          <li>Fournir des informations véridiques et à jour</li>
          <li>Respecter les autres utilisateurs de la plateforme</li>
          <li>Ne pas utiliser le service à des fins illégales ou non autorisées</li>
          <li>Ne pas tenter de perturber ou compromettre le fonctionnement du service</li>
          <li>Respecter les engagements pris via la plateforme (présence aux événements confirmés)</li>
        </ul>

        <h2 id="contenu-utilisateur" style={sectionTitleStyle}>5. Contenu utilisateur</h2>
        <p style={textStyle}>
          Vous êtes seul responsable du contenu que vous publiez sur la plateforme (textes, photos, vidéos).
          Ce contenu ne doit pas :
        </p>
        <ul style={listStyle}>
          <li>Violer les droits de propriété intellectuelle de tiers</li>
          <li>Contenir des propos diffamatoires, injurieux ou discriminatoires</li>
          <li>Être contraire aux bonnes mœurs ou à l'ordre public</li>
          <li>Contenir des informations fausses ou trompeuses</li>
        </ul>
        <p style={textStyle}>
          Connect Comedy Club se réserve le droit de supprimer tout contenu jugé inapproprié.
        </p>

        <h2 id="propriete-intellectuelle" style={sectionTitleStyle}>6. Propriété intellectuelle</h2>
        <p style={textStyle}>
          La plateforme Connect Comedy Club, son design, ses logos et son contenu sont protégés par
          les droits de propriété intellectuelle. Vous vous engagez à ne pas reproduire, modifier ou
          exploiter ces éléments sans autorisation préalable.
        </p>
        <p style={textStyle}>
          Vous conservez la propriété de votre contenu mais accordez à Connect Comedy Club une licence
          d'utilisation pour afficher ce contenu sur la plateforme.
        </p>

        <h2 id="responsabilite" style={sectionTitleStyle}>7. Responsabilité</h2>
        <p style={textStyle}>
          Connect Comedy Club agit en tant qu'intermédiaire technique et ne peut être tenu responsable :
        </p>
        <ul style={listStyle}>
          <li>Des relations entre comédiens et organisateurs</li>
          <li>De l'exécution ou de la non-exécution des prestations convenues</li>
          <li>Des litiges pouvant survenir entre utilisateurs</li>
          <li>Du contenu publié par les utilisateurs</li>
        </ul>
        <p style={textStyle}>
          La plateforme est fournie "en l'état". Nous ne garantissons pas un fonctionnement ininterrompu
          ou exempt d'erreurs.
        </p>

        <h2 id="tarification" style={sectionTitleStyle}>8. Tarification</h2>
        <p style={textStyle}>
          L'utilisation de la plateforme Connect Comedy Club est actuellement gratuite.
          Connect Comedy Club se réserve le droit de proposer des services payants à l'avenir.
          Dans ce cas, les utilisateurs seront informés des tarifs applicables avant toute souscription.
        </p>

        <h2 id="suspension-resiliation" style={sectionTitleStyle}>9. Suspension et résiliation</h2>
        <p style={textStyle}>
          Connect Comedy Club se réserve le droit de suspendre ou supprimer votre compte en cas de :
        </p>
        <ul style={listStyle}>
          <li>Non-respect des présentes CGU</li>
          <li>Comportement inapproprié envers d'autres utilisateurs</li>
          <li>Absences répétées non justifiées aux événements</li>
          <li>Publication de contenu illicite</li>
        </ul>
        <p style={textStyle}>
          Vous pouvez demander la suppression de votre compte à tout moment en contactant notre support.
        </p>

        <h2 id="protection-donnees" style={sectionTitleStyle}>10. Protection des données</h2>
        <p style={textStyle}>
          Nous collectons et traitons vos données personnelles conformément à notre{' '}
          <Link to="/politique-confidentialite" style={linkStyle}>Politique de confidentialité</Link>.
        </p>

        <h2 id="modification-cgu" style={sectionTitleStyle}>11. Modification des CGU</h2>
        <p style={textStyle}>
          Connect Comedy Club se réserve le droit de modifier les présentes CGU à tout moment.
          Les modifications entreront en vigueur dès leur publication sur le site.
          Votre utilisation continue du service après ces modifications vaut acceptation des nouvelles conditions.
        </p>

        <h2 id="droit-applicable" style={sectionTitleStyle}>12. Droit applicable et juridiction</h2>
        <p style={textStyle}>
          Les présentes CGU sont soumises au droit français. En cas de litige, et après échec de toute
          tentative de résolution amiable, les tribunaux français seront seuls compétents.
        </p>

        <h2 id="mediation" style={sectionTitleStyle}>13. Médiation des litiges</h2>
        <p style={textStyle}>
          Conformément aux articles L.611-1 et suivants du Code de la consommation, en cas de litige
          non résolu, vous pouvez recourir gratuitement au service de médiation.
        </p>
        <p style={textStyle}>
          <strong>Médiateur :</strong> [En cours de désignation]
        </p>
        <p style={textStyle}>
          Vous pouvez également utiliser la plateforme européenne de règlement en ligne des litiges :{' '}
          <a
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            https://ec.europa.eu/consumers/odr
          </a>
        </p>

        <h2 id="force-majeure" style={sectionTitleStyle}>14. Force majeure</h2>
        <p style={textStyle}>
          Connect Comedy Club ne pourra être tenu responsable de l'inexécution de ses obligations
          en cas de survenance d'un événement de force majeure tel que défini par l'article 1218
          du Code civil, notamment : catastrophes naturelles, pandémies, guerres, grèves générales,
          pannes d'infrastructure internet, décisions gouvernementales.
        </p>

        <h2 id="contact" style={sectionTitleStyle}>15. Contact</h2>
        <p style={textStyle}>
          Pour toute question concernant ces CGU, vous pouvez nous contacter à : <strong>contact@connectcomedyclub.com</strong>
        </p>

        {/* <p style={{ ...textStyle, marginTop: '40px', fontStyle: 'italic', color: 'rgba(255,255,255,0.6)' }}>
          Dernière mise à jour : [À compléter avec une date fixe]
        </p> */}
        </div>
      </div>
    </div>
  );
}

export default TermsOfServicePage;
