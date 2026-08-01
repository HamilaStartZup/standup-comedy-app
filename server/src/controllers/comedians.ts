import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UserModel } from '../models/User';
import { EventModel } from '../models/Event';
import { ApplicationModel } from '../models/Application';
import {
  detectZoneType,
  matchesMobilityZone
} from '../utils/geographicMatching';

/**
 * @route GET /api/comedians/search-by-zone
 * @desc Recherche d'humoristes par zone géographique
 */
export const searchComediansByZone = async (req: AuthRequest, res: Response) => {
  try {
    const { zone, experienceLevel, page = '1', limit = '20' } = req.query;

    if (!zone || typeof zone !== 'string' || zone.trim() === '') {
      return res.status(400).json({
        message: 'Le paramètre zone est requis',
        comedians: [],
        total: 0
      });
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

    // Détecter le type de zone et récupérer les infos géographiques
    const searchZone = await detectZoneType(zone.trim());

    console.log(`🔍 [COMEDIANS SEARCH] Recherche par zone: "${zone}" -> Type: ${searchZone.type}, Valeur: ${searchZone.value}, Dept: ${searchZone.department}, Region: ${searchZone.region}`);

    // Construire la requête MongoDB pour les humoristes actifs
    const query: any = {
      role: 'COMEDIAN',
      isActive: { $ne: false }
    };

    // Filtrer par niveau d'expérience si spécifié
    if (experienceLevel && experienceLevel !== 'all') {
      query['profile.numberOfScenes'] = experienceLevel;
    }

    // Récupérer tous les humoristes avec leurs zones de mobilité
    const allComedians = await UserModel.find(query)
      .select('firstName lastName email city phone profile stats')
      .lean();

    console.log(`📊 [COMEDIANS SEARCH] ${allComedians.length} humoristes trouvés avant filtrage par zone`);

    // Filtrer par zone de mobilité
    const matchingComedians = allComedians.filter(comedian => {
      const mobilityZones = (comedian as any).profile?.mobilityZone || [];

      if (!mobilityZones || mobilityZones.length === 0) {
        return false;
      }

      return mobilityZones.some((mz: { type: 'ville' | 'departement' | 'region'; value: string }) =>
        matchesMobilityZone(mz, searchZone)
      );
    });

    console.log(`✅ [COMEDIANS SEARCH] ${matchingComedians.length} humoristes correspondent à la zone`);

    // Pagination
    const total = matchingComedians.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedComedians = matchingComedians.slice(startIndex, startIndex + limitNum);

    // Coordonnées (email/phone) visibles seulement pour SUPER_ADMIN, ou pour un organisateur
    // si le comédien a déjà candidaté à l'un de ses évènements (même règle que getUserProfile).
    const isAdmin = req.user?.role === 'SUPER_ADMIN';
    let comediansWithContactAccess = new Set<string>();
    if (!isAdmin && req.user?.role === 'ORGANIZER') {
      const ownedEventIds = await EventModel.find({ organizer: req.user.id }).distinct('_id');
      if (ownedEventIds.length > 0) {
        const comedianIds = paginatedComedians.map(c => c._id);
        const applicants = await ApplicationModel.find({
          comedian: { $in: comedianIds },
          event: { $in: ownedEventIds },
        }).distinct('comedian');
        comediansWithContactAccess = new Set(applicants.map(id => id.toString()));
      }
    }

    // Formater les résultats
    const formattedComedians = paginatedComedians.map(comedian => {
      const hasContactAccess = isAdmin || comediansWithContactAccess.has(comedian._id.toString());
      return {
        _id: comedian._id,
        firstName: comedian.firstName,
        lastName: comedian.lastName,
        email: hasContactAccess ? comedian.email : undefined,
        city: comedian.city,
        phone: hasContactAccess ? comedian.phone : undefined,
        stageName: (comedian as any).profile?.stageName,
        bio: (comedian as any).profile?.bio,
        numberOfScenes: (comedian as any).profile?.numberOfScenes,
        comedyStyle: (comedian as any).profile?.comedyStyle || [],
        performanceLanguages: (comedian as any).profile?.performanceLanguages || [],
        mobilityZone: (comedian as any).profile?.mobilityZone || [],
        socialLinks: (comedian as any).profile?.socialLinks,
        stats: comedian.stats
      };
    });

    return res.status(200).json({
      comedians: formattedComedians,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      searchZone: {
        type: searchZone.type,
        value: searchZone.value,
        department: searchZone.department,
        region: searchZone.region
      }
    });

  } catch (error) {
    console.error('❌ [COMEDIANS SEARCH] Erreur:', error);
    return res.status(500).json({
      message: 'Erreur lors de la recherche d\'humoristes',
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
};
