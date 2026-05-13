export type ProfilUtilisateur =
  | "humoriste_solo"
  | "auteur"
  | "producteur"
  | "salle"
  | "festival"
  | "compagnie";

export type Categorie =
  | "subvention"
  | "bourse"
  | "residence"
  | "prix"
  | "fonds"
  | "accompagnement";

export type TypeProjet =
  | "creation"
  | "diffusion"
  | "ecriture"
  | "production"
  | "festival";

export type Aide = {
  id: string;
  organisme: string;
  dispositif: string;
  categorie: Categorie;
  sous_categorie: string;
  public_cible: string[];
  profil_utilisateur: ProfilUtilisateur[];
  type_de_projet: TypeProjet[];
  description_courte: string;
  conditions_eligibilite: string;
  montant: string;
  periode: string;
  zone_geographique: string;
  url_source: string;
  derniere_verification: string;
  mots_cles: string[];
  niveau_pertinence_humour: number;
  statut_actif: boolean;
};

export const PROFIL_LABELS: Record<ProfilUtilisateur, string> = {
  humoriste_solo: "Humoriste solo",
  auteur: "Auteur",
  producteur: "Producteur",
  salle: "Salle",
  festival: "Festival",
  compagnie: "Compagnie",
};
