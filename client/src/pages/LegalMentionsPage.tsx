import { type CSSProperties, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TableOfContents, { type TocSection } from '../components/TableOfContents';

function LegalMentionsPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const legalMentionsSections: TocSection[] = [
    { id: 'definitions', title: 'Définitions', level: 'h2' },
    { id: 'presentation', title: '1. Présentation du site internet', level: 'h2' },
    { id: 'cgu', title: '2. Conditions générales d\'utilisation', level: 'h2' },
    { id: 'services', title: '3. Description des services fournis', level: 'h2' },
    { id: 'limitations-techniques', title: '4. Limitations contractuelles sur les données techniques', level: 'h2' },
    { id: 'propriete-intellectuelle', title: '5. Propriété intellectuelle et contrefaçons', level: 'h2' },
    { id: 'responsabilite', title: '6. Limitations de responsabilité', level: 'h2' },
    { id: 'gestion-donnees', title: '7. Gestion des données personnelles', level: 'h2' },
    { id: 'responsables-collecte', title: '7.1 Responsables de la collecte des données', level: 'h3' },
    { id: 'finalite-donnees', title: '7.2 Finalité des données collectées', level: 'h3' },
    { id: 'droits-acces', title: '7.3 Droit d\'accès, de rectification et d\'opposition', level: 'h3' },
    { id: 'non-communication', title: '7.4 Non-communication des données personnelles', level: 'h3' },
    { id: 'types-donnees', title: '7.5 Types de données collectées', level: 'h3' },
    { id: 'notification-incident', title: '8. Notification d\'incident', level: 'h2' },
    { id: 'securite', title: 'Sécurité', level: 'h3' },
    { id: 'liens-cookies', title: '9. Liens hypertextes, cookies et balises internet', level: 'h2' },
    { id: 'cookies', title: '9.1 Cookies', level: 'h3' },
    { id: 'balises', title: '9.2 Balises ("tags") internet', level: 'h3' },
    { id: 'droit-applicable', title: '10. Droit applicable et attribution de juridiction', level: 'h2' },
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

  const subSectionTitleStyle: CSSProperties = {
    color: '#FF5A7E',
    marginTop: '24px',
    marginBottom: '12px',
    fontSize: '1.1em',
  };

  const textStyle: CSSProperties = {
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: '1.7',
    marginBottom: '12px',
  };

  const listStyle: CSSProperties = {
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: '1.8',
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

  const siteUrl = 'https://connectcomedyclub.com';

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle}>
        <TableOfContents sections={legalMentionsSections} />

        <div style={containerStyle}>
          <Link to="/" style={backLinkStyle}>&larr; Retour à l'accueil</Link>

          <h1 style={headingStyle}>Mentions Légales</h1>

          {/* Définitions */}
          <h2 id="definitions" style={sectionTitleStyle}>Définitions</h2>
        <p style={textStyle}>
          <strong>Client :</strong> Toute personne majeure ou toute entreprise qui utilise notre plateforme pour trouver des comédiens ou proposer des spectacles.
        </p>
        <p style={textStyle}>
          <strong>Prestations et Services :</strong> <a href={siteUrl} style={linkStyle}>{siteUrl}</a> vous propose une plateforme qui met en relation les comédiens avec les organisateurs d'événements de stand-up comedy.
        </p>
        <p style={textStyle}>
          <strong>Contenu :</strong> Toutes les informations que vous trouvez sur notre site : les textes, les images et les vidéos.
        </p>
        <p style={textStyle}>
          <strong>Informations clients :</strong> Vos données personnelles que nous utilisons pour gérer votre compte, communiquer avec vous et améliorer notre service grâce à des analyses.
        </p>
        <p style={textStyle}>
          <strong>Utilisateur :</strong> Toute personne qui visite ou utilise notre site.
        </p>
        <p style={textStyle}>
          <strong>Informations personnelles :</strong> Toutes les informations qui permettent de vous identifier, comme votre nom, votre email ou votre numéro de téléphone.
        </p>
        <p style={textStyle}>
          Les termes « données à caractère personnel », « personne concernée », « sous-traitant » et « données sensibles » sont définis par la loi sur la protection des données (RGPD).
        </p>

        {/* 1. Présentation du site internet */}
        <h2 id="presentation" style={sectionTitleStyle}>1. Présentation du site internet</h2>
        <p style={textStyle}>
          En vertu de l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique, il est précisé aux utilisateurs du site internet <a href={siteUrl} style={linkStyle}>{siteUrl}</a> l'identité des différents intervenants dans le cadre de sa réalisation et de son suivi :
        </p>
        <p style={textStyle}>
          <strong>Propriétaire :</strong> START IA – SAS au capital de 300 € – Numéro de TVA : FR08939213104 – 23 Avenue Clément Ader, Bâtiment F, 78190 Trappes
        </p>
        <p style={textStyle}>
          <strong>SIRET :</strong> 939 213 104 00010<br />
          <strong>RCS :</strong> Trappes
        </p>
        <p style={textStyle}>
          <strong>Responsable publication :</strong> START IA – contact@connectcomedyclub.com<br />
          Le responsable publication est une personne physique.
        </p>
        <p style={textStyle}>
          <strong>Webmaster :</strong> START IA – contact@connectcomedyclub.com
        </p>
        <p style={textStyle}>
          <strong>Hébergeur :</strong> OVHcloud – 2 rue Kellermann, 59100 Roubaix – Téléphone : 1007
        </p>
        <p style={textStyle}>
          <strong>Délégué à la protection des données :</strong> START IA – contact@connectcomedyclub.com
        </p>

        {/* 2. Conditions générales d'utilisation */}
        <h2 id="cgu" style={sectionTitleStyle}>2. Conditions générales d'utilisation du site et des services proposés</h2>
        <p style={textStyle}>
          Le Site constitue une œuvre de l'esprit protégée par les dispositions du Code de la Propriété Intellectuelle et des Réglementations Internationales applicables. Le Client ne peut en aucune manière réutiliser, céder ou exploiter pour son propre compte tout ou partie des éléments ou travaux du Site.
        </p>
        <p style={textStyle}>
          L'utilisation du site <a href={siteUrl} style={linkStyle}>{siteUrl}</a> implique l'acceptation pleine et entière des conditions générales d'utilisation ci-après décrites. Ces conditions d'utilisation sont susceptibles d'être modifiées ou complétées à tout moment, les utilisateurs du site sont donc invités à les consulter de manière régulière.
        </p>
        <p style={textStyle}>
          Ce site internet est normalement accessible à tout moment aux utilisateurs. Une interruption pour raison de maintenance technique peut être toutefois décidée par Connect Comedy Club, qui s'efforcera alors de communiquer préalablement aux utilisateurs les dates et heures de l'intervention.
        </p>
        <p style={textStyle}>
          Le site web est mis à jour régulièrement. De la même façon, les mentions légales peuvent être modifiées à tout moment : elles s'imposent néanmoins à l'utilisateur qui est invité à s'y référer le plus souvent possible afin d'en prendre connaissance.
        </p>

        {/* 3. Description des services fournis */}
        <h2 id="services" style={sectionTitleStyle}>3. Description des services fournis</h2>
        <p style={textStyle}>
          Le site internet <a href={siteUrl} style={linkStyle}>{siteUrl}</a> a pour objet de fournir une plateforme de mise en relation entre comédiens (humoristes) et organisateurs d'événements de stand-up comedy. Le service permet aux comédiens de trouver des opportunités de spectacles et aux organisateurs de recruter des talents pour leurs événements.
        </p>
        <p style={textStyle}>
          Connect Comedy Club s'efforce de fournir sur le site des informations aussi précises que possible. Toutefois, il ne pourra être tenu responsable des oublis, des inexactitudes et des carences dans la mise à jour, qu'elles soient de son fait ou du fait des tiers partenaires qui lui fournissent ces informations.
        </p>
        <p style={textStyle}>
          Toutes les informations indiquées sur le site sont données à titre indicatif, et sont susceptibles d'évoluer. Par ailleurs, les renseignements figurant sur le site ne sont pas exhaustifs. Ils sont donnés sous réserve de modifications ayant été apportées depuis leur mise en ligne.
        </p>

        {/* 4. Limitations contractuelles sur les données techniques */}
        <h2 id="limitations-techniques" style={sectionTitleStyle}>4. Limitations contractuelles sur les données techniques</h2>
        <p style={textStyle}>
          Le site utilise les technologies JavaScript et React.
        </p>
        <p style={textStyle}>
          Le site Internet ne pourra être tenu responsable de dommages matériels liés à l'utilisation du site. De plus, l'utilisateur du site s'engage à accéder au site en utilisant un matériel récent, ne contenant pas de virus et avec un navigateur de dernière génération mis à jour.
        </p>
        <p style={textStyle}>
          Le site <a href={siteUrl} style={linkStyle}>{siteUrl}</a> est hébergé chez un prestataire sur le territoire de l'Union Européenne conformément aux dispositions du Règlement Général sur la Protection des Données (RGPD : n° 2016-679).
        </p>
        <p style={textStyle}>
          L'objectif est d'apporter une prestation qui assure le meilleur taux d'accessibilité. L'hébergeur assure la continuité de son service 24 Heures sur 24, tous les jours de l'année. Il se réserve néanmoins la possibilité d'interrompre le service d'hébergement pour les durées les plus courtes possibles notamment à des fins de maintenance, d'amélioration de ses infrastructures, de défaillance de ses infrastructures ou si les Prestations et Services génèrent un trafic réputé anormal.
        </p>
        <p style={textStyle}>
          Connect Comedy Club et l'hébergeur ne pourront être tenus responsables en cas de dysfonctionnement du réseau Internet, des lignes téléphoniques ou du matériel informatique et de téléphonie lié notamment à l'encombrement du réseau empêchant l'accès au serveur.
        </p>

        {/* 5. Propriété intellectuelle et contrefaçons */}
        <h2 id="propriete-intellectuelle" style={sectionTitleStyle}>5. Propriété intellectuelle et contrefaçons</h2>
        <p style={textStyle}>
          Connect Comedy Club est propriétaire des droits de propriété intellectuelle et détient les droits d'usage sur tous les éléments accessibles sur le site internet, notamment les textes, images, graphismes, logos, vidéos, icônes et sons. Toute reproduction, représentation, modification, publication, adaptation de tout ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite, sauf autorisation écrite préalable de Connect Comedy Club.
        </p>
        <p style={textStyle}>
          Toute exploitation non autorisée du site ou de l'un quelconque des éléments qu'il contient sera considérée comme constitutive d'une contrefaçon et poursuivie conformément aux dispositions des articles L.335-2 et suivants du Code de Propriété Intellectuelle.
        </p>

        {/* 6. Limitations de responsabilité */}
        <h2 id="responsabilite" style={sectionTitleStyle}>6. Limitations de responsabilité</h2>
        <p style={textStyle}>
          Connect Comedy Club agit en tant qu'éditeur du site et est responsable de la qualité et de la véracité du Contenu qu'il publie.
        </p>
        <p style={textStyle}>
          Connect Comedy Club ne pourra être tenu responsable des dommages directs et indirects causés au matériel de l'utilisateur, lors de l'accès au site internet, et résultant soit de l'utilisation d'un matériel ne répondant pas aux spécifications indiquées au point 4, soit de l'apparition d'un bug ou d'une incompatibilité.
        </p>
        <p style={textStyle}>
          Connect Comedy Club ne pourra également être tenu responsable des dommages indirects (tels par exemple qu'une perte de marché ou perte d'une chance) consécutifs à l'utilisation du site.
        </p>
        <p style={textStyle}>
          Des espaces interactifs (possibilité de créer un profil, de postuler à des événements, de contacter d'autres utilisateurs) sont à la disposition des utilisateurs. Connect Comedy Club se réserve le droit de supprimer, sans mise en demeure préalable, tout contenu déposé dans cet espace qui contreviendrait à la législation applicable en France, en particulier aux dispositions relatives à la protection des données. Le cas échéant, Connect Comedy Club se réserve également la possibilité de mettre en cause la responsabilité civile et/ou pénale de l'utilisateur, notamment en cas de message à caractère raciste, injurieux, diffamant, ou pornographique, quel que soit le support utilisé (texte, photographie…).
        </p>

        {/* 7. Gestion des données personnelles */}
        <h2 id="gestion-donnees" style={sectionTitleStyle}>7. Gestion des données personnelles</h2>
        <p style={textStyle}>
          Le Client est informé des réglementations concernant la communication marketing, la loi du 21 Juin 2014 pour la confiance dans l'Économie Numérique, la Loi Informatique et Liberté du 06 Août 2004 ainsi que du Règlement Général sur la Protection des Données (RGPD : n° 2016-679).
        </p>

        <h3 id="responsables-collecte" style={subSectionTitleStyle}>7.1 Responsables de la collecte des données personnelles</h3>
        <p style={textStyle}>
          Pour les Données Personnelles collectées dans le cadre de la création du compte personnel de l'Utilisateur et de sa navigation sur le Site, le responsable du traitement des Données Personnelles est : START IA. <a href={siteUrl} style={linkStyle}>{siteUrl}</a> est représenté par Hedi Magdelonnette, son représentant légal.
        </p>
        <p style={textStyle}>
          En tant que responsable du traitement des données qu'il collecte, Connect Comedy Club s'engage à respecter le cadre des dispositions légales en vigueur. Il lui appartient notamment d'établir les finalités de ses traitements de données, de fournir à ses prospects et clients, à partir de la collecte de leurs consentements, une information complète sur le traitement de leurs données personnelles et de maintenir un registre des traitements conforme à la réalité.
        </p>
        <p style={textStyle}>
          Chaque fois que Connect Comedy Club traite des Données Personnelles, Connect Comedy Club prend toutes les mesures raisonnables pour s'assurer de l'exactitude et de la pertinence des Données Personnelles au regard des finalités pour lesquelles Connect Comedy Club les traite.
        </p>

        <h3 id="finalite-donnees" style={subSectionTitleStyle}>7.2 Finalité des données collectées</h3>
        <p style={textStyle}>
          Connect Comedy Club est susceptible de traiter tout ou partie des données :
        </p>
        <ul style={listStyle}>
          <li>pour permettre la navigation sur le Site et la gestion et la traçabilité des prestations et services commandés par l'utilisateur : données de connexion et d'utilisation du Site, facturation, historique des événements, etc.</li>
          <li>pour prévenir et lutter contre la fraude informatique (spamming, hacking…) : matériel informatique utilisé pour la navigation, l'adresse IP, le mot de passe (hashé)</li>
          <li>pour améliorer la navigation sur le Site : données de connexion et d'utilisation</li>
          <li>pour mener des enquêtes de satisfaction facultatives : adresse email</li>
          <li>pour mener des campagnes de communication (sms, mail) : numéro de téléphone, adresse email</li>
          <li>pour permettre la mise en relation entre comédiens et organisateurs : profil, disponibilités, coordonnées</li>
        </ul>
        <p style={textStyle}>
          Connect Comedy Club ne commercialise pas vos données personnelles qui sont donc uniquement utilisées par nécessité ou à des fins statistiques et d'analyses.
        </p>

        <h3 id="droits-acces" style={subSectionTitleStyle}>7.3 Droit d'accès, de rectification et d'opposition</h3>
        <p style={textStyle}>
          Conformément à la réglementation européenne en vigueur, les Utilisateurs de Connect Comedy Club disposent des droits suivants :
        </p>
        <ul style={listStyle}>
          <li>droit d'accès (article 15 RGPD) et de rectification (article 16 RGPD), de mise à jour, de complétude des données des Utilisateurs</li>
          <li>droit de verrouillage ou d'effacement des données des Utilisateurs à caractère personnel (article 17 du RGPD), lorsqu'elles sont inexactes, incomplètes, équivoques, périmées, ou dont la collecte, l'utilisation, la communication ou la conservation est interdite</li>
          <li>droit de retirer à tout moment un consentement (article 13-2c RGPD)</li>
          <li>droit à la limitation du traitement des données des Utilisateurs (article 18 RGPD)</li>
          <li>droit d'opposition au traitement des données des Utilisateurs (article 21 RGPD)</li>
          <li>droit à la portabilité des données que les Utilisateurs auront fournies, lorsque ces données font l'objet de traitements automatisés fondés sur leur consentement ou sur un contrat (article 20 RGPD)</li>
          <li>droit de définir le sort des données des Utilisateurs après leur mort et de choisir à qui Connect Comedy Club devra communiquer (ou non) ses données à un tiers qu'ils aura préalablement désigné</li>
        </ul>
        <p style={textStyle}>
          Dès que Connect Comedy Club a connaissance du décès d'un Utilisateur et à défaut d'instructions de sa part, Connect Comedy Club s'engage à détruire ses données, sauf si leur conservation s'avère nécessaire à des fins probatoires ou pour répondre à une obligation légale.
        </p>
        <p style={textStyle}>
          Si l'Utilisateur souhaite savoir comment Connect Comedy Club utilise ses Données Personnelles, demander à les rectifier ou s'oppose à leur traitement, l'Utilisateur peut contacter Connect Comedy Club par écrit à l'adresse suivante :
        </p>
        <p style={textStyle}>
          <strong>START IA – DPO</strong><br />
          23 Avenue Clément Ader, Bâtiment F<br />
          78190 Trappes<br />
          Email : [à compléter]
        </p>
        <p style={textStyle}>
          Dans ce cas, l'Utilisateur doit indiquer les Données Personnelles qu'il souhaiterait que Connect Comedy Club corrige, mette à jour ou supprime, en s'identifiant précisément avec une copie d'une pièce d'identité (carte d'identité ou passeport).
        </p>
        <p style={textStyle}>
          Les demandes de suppression de Données Personnelles seront soumises aux obligations qui sont imposées à Connect Comedy Club par la loi, notamment en matière de conservation ou d'archivage des documents. Enfin, les Utilisateurs de Connect Comedy Club peuvent déposer une réclamation auprès des autorités de contrôle, et notamment de la CNIL (<a href="https://www.cnil.fr/fr/plaintes" style={linkStyle} target="_blank" rel="noopener noreferrer">https://www.cnil.fr/fr/plaintes</a>).
        </p>

        <h3 id="non-communication" style={subSectionTitleStyle}>7.4 Non-communication des données personnelles</h3>
        <p style={textStyle}>
          Connect Comedy Club s'interdit de traiter, héberger ou transférer les Informations collectées sur ses Clients vers un pays situé en dehors de l'Union européenne ou reconnu comme « non adéquat » par la Commission européenne sans en informer préalablement le client. Pour autant, Connect Comedy Club reste libre du choix de ses sous-traitants techniques et commerciaux à la condition qu'ils présentent les garanties suffisantes au regard des exigences du Règlement Général sur la Protection des Données (RGPD : n° 2016-679).
        </p>
        <p style={textStyle}>
          Connect Comedy Club s'engage à prendre toutes les précautions nécessaires afin de préserver la sécurité des Informations et notamment qu'elles ne soient pas communiquées à des personnes non autorisées. Cependant, si un incident impactant l'intégrité ou la confidentialité des Informations du Client est portée à la connaissance de Connect Comedy Club, celle-ci devra dans les meilleurs délais informer le Client et lui communiquer les mesures de corrections prises. Par ailleurs Connect Comedy Club ne collecte aucune « données sensibles ».
        </p>
        <p style={textStyle}>
          Les Données Personnelles de l'Utilisateur peuvent être traitées par des filiales de Connect Comedy Club et des sous-traitants (prestataires de services), exclusivement afin de réaliser les finalités de la présente politique.
        </p>
        <p style={textStyle}>
          Dans la limite de leurs attributions respectives et pour les finalités rappelées ci-dessus, les principales personnes susceptibles d'avoir accès aux données des Utilisateurs de Connect Comedy Club sont principalement les membres de notre équipe technique et support.
        </p>

        <h3 id="types-donnees" style={subSectionTitleStyle}>7.5 Types de données collectées</h3>
        <p style={textStyle}>
          Concernant les utilisateurs du Site Connect Comedy Club, nous collectons les données suivantes qui sont indispensables au fonctionnement du service :
        </p>
        <ul style={listStyle}>
          <li>Données d'identification : nom, prénom, adresse email, numéro de téléphone</li>
          <li>Données de profil : photo, biographie, liens vers réseaux sociaux (pour les comédiens)</li>
          <li>Données professionnelles : expérience, spécialités, types de venues (selon le type d'utilisateur)</li>
          <li>Données de connexion : adresse IP, logs de connexion</li>
          <li>Données relatives aux événements : dates, lieux, conditions des prestations</li>
        </ul>
        <p style={textStyle}>
          Ces données sont conservées pour une période maximale de 3 ans après la fin de la relation contractuelle, sauf obligation légale contraire.
        </p>

        {/* 8. Notification d'incident */}
        <h2 id="notification-incident" style={sectionTitleStyle}>8. Notification d'incident</h2>
        <p style={textStyle}>
          Quels que soient les efforts fournis, aucune méthode de transmission sur Internet et aucune méthode de stockage électronique n'est complètement sûre. Nous ne pouvons en conséquence pas garantir une sécurité absolue.
        </p>
        <p style={textStyle}>
          Si nous prenions connaissance d'une brèche de la sécurité, nous avertirions les utilisateurs concernés afin qu'ils puissent prendre les mesures appropriées. Nos procédures de notification d'incident tiennent compte de nos obligations légales, qu'elles se situent au niveau national ou européen. Nous nous engageons à informer pleinement nos clients de toutes les questions relevant de la sécurité de leur compte et à leur fournir toutes les informations nécessaires pour les aider à respecter leurs propres obligations réglementaires en matière de reporting.
        </p>
        <p style={textStyle}>
          Aucune information personnelle de l'utilisateur du site Connect Comedy Club n'est publiée à l'insu de l'utilisateur, échangée, transférée, cédée ou vendue sur un support quelconque à des tiers. Seule l'hypothèse du rachat de Connect Comedy Club et de ses droits permettrait la transmission des dites informations à l'éventuel acquéreur qui serait à son tour tenu de la même obligation de conservation et de modification des données vis à vis de l'utilisateur du site.
        </p>

        <h3 id="securite" style={subSectionTitleStyle}>Sécurité</h3>
        <p style={textStyle}>
          Pour assurer la sécurité et la confidentialité des Données Personnelles, Connect Comedy Club utilise des réseaux protégés par des dispositifs standards tels que par pare-feu, la pseudonymisation, l'encryption et mot de passe.
        </p>
        <p style={textStyle}>
          Lors du traitement des Données Personnelles, Connect Comedy Club prend toutes les mesures raisonnables visant à les protéger contre toute perte, utilisation détournée, accès non autorisé, divulgation, altération ou destruction.
        </p>

        {/* 9. Liens hypertextes, cookies et balises */}
        <h2 id="liens-cookies" style={sectionTitleStyle}>9. Liens hypertextes, cookies et balises internet</h2>
        <p style={textStyle}>
          Le site Connect Comedy Club contient un certain nombre de liens hypertextes vers d'autres sites, mis en place avec l'autorisation de Connect Comedy Club. Cependant, Connect Comedy Club n'a pas la possibilité de vérifier le contenu des sites ainsi visités, et n'assumera en conséquence aucune responsabilité de ce fait.
        </p>
        <p style={textStyle}>
          Sauf si vous décidez de désactiver les cookies, vous acceptez que le site puisse les utiliser. Vous pouvez à tout moment désactiver ces cookies et ce gratuitement à partir des possibilités de désactivation qui vous sont offertes et rappelées ci-après, sachant que cela peut réduire ou empêcher l'accessibilité à tout ou partie des Services proposés par le site.
        </p>

        <h3 id="cookies" style={subSectionTitleStyle}>9.1 Cookies</h3>
        <p style={textStyle}>
          Un « cookie » est un petit fichier d'information envoyé sur le navigateur de l'Utilisateur et enregistré au sein du terminal de l'Utilisateur (ex : ordinateur, smartphone). Ce fichier comprend des informations telles que le nom de domaine de l'Utilisateur, le fournisseur d'accès Internet de l'Utilisateur, le système d'exploitation de l'Utilisateur, ainsi que la date et l'heure d'accès. Les Cookies ne risquent en aucun cas d'endommager le terminal de l'Utilisateur.
        </p>
        <p style={textStyle}>
          Connect Comedy Club est susceptible de traiter les informations de l'Utilisateur concernant sa visite du Site, telles que les pages consultées, les recherches effectuées. Ces informations permettent à Connect Comedy Club d'améliorer le contenu du Site, de la navigation de l'Utilisateur.
        </p>
        <p style={textStyle}>
          Les Cookies facilitant la navigation et/ou la fourniture des services proposés par le Site, l'Utilisateur peut configurer son navigateur pour qu'il lui permette de décider s'il souhaite ou non les accepter de manière à ce que des Cookies soient enregistrés dans le terminal ou, au contraire, qu'ils soient rejetés, soit systématiquement, soit selon leur émetteur.
        </p>
        <p style={textStyle}>
          Si l'Utilisateur refuse l'enregistrement de Cookies dans son terminal ou son navigateur, ou si l'Utilisateur supprime ceux qui y sont enregistrés, l'Utilisateur est informé que sa navigation et son expérience sur le Site peuvent être limitées.
        </p>
        <p style={textStyle}>
          À tout moment, l'Utilisateur peut faire le choix d'exprimer et de modifier ses souhaits en matière de Cookies.
        </p>
        <p style={textStyle}>
          Pour plus d'informations sur la gestion des cookies, consultez notre{' '}
          <Link to="/politique-confidentialite" style={linkStyle}>Politique de confidentialité</Link>.
        </p>

        <h3 id="balises" style={subSectionTitleStyle}>9.2 Balises ("tags") internet</h3>
        <p style={textStyle}>
          Connect Comedy Club peut employer occasionnellement des balises Internet (également appelées « tags », ou balises d'action, GIF à un pixel, GIF transparents, GIF invisibles et GIF un à un) et les déployer par l'intermédiaire d'un partenaire spécialiste d'analyses Web susceptible de se trouver (et donc de stocker les informations correspondantes, y compris l'adresse IP de l'Utilisateur) dans un pays étranger.
        </p>
        <p style={textStyle}>
          Ces balises sont placées à la fois dans les publicités en ligne permettant aux internautes d'accéder au Site, et sur les différentes pages de celui-ci. Cette technologie permet à Connect Comedy Club d'évaluer les réponses des visiteurs face au Site et l'efficacité de ses actions (par exemple, le nombre de fois où une page est ouverte et les informations consultées), ainsi que l'utilisation de ce Site par l'Utilisateur.
        </p>

        {/* 10. Droit applicable et attribution de juridiction */}
        <h2 id="droit-applicable" style={sectionTitleStyle}>10. Droit applicable et attribution de juridiction</h2>
        <p style={textStyle}>
          Tout litige en relation avec l'utilisation du site Connect Comedy Club est soumis au droit français. En dehors des cas où la loi ne le permet pas, il est fait attribution exclusive de juridiction aux tribunaux compétents de Versailles.
        </p>

        {/* Date de mise à jour */}
        {/* <p style={{ ...textStyle, marginTop: '40px', fontStyle: 'italic', color: 'rgba(255,255,255,0.6)' }}>
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
        </p> */}
        </div>
      </div>
    </div>
  );
}

export default LegalMentionsPage;
