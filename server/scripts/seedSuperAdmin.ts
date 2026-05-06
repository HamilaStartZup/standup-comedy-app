import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env';
import { UserModel } from '../src/models/User';

// Configuration du super-admin
const SUPER_ADMIN_EMAIL = 'contact@connectcomedyclub.com';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin2024!'; // Mot de passe sécurisé par défaut

async function createSuperAdmin() {
  try {
    console.log('🚀 Démarrage du script de seeding pour le super-administrateur...');
    
    // Connexion à la base de données
    if (!config.database.url) {
      throw new Error('❌ DATABASE_URL n\'est pas définie dans les variables d\'environnement');
    }

    await mongoose.connect(config.database.url);
    console.log('✅ Connexion à la base de données réussie');

    // Vérifier s'il existe déjà un super-admin
    const existingSuperAdmin = await UserModel.findOne({ role: 'SUPER_ADMIN' });
    
    if (existingSuperAdmin) {
      console.log('⚠️  Un super-administrateur existe déjà !');
      console.log(`📧 Email du super-admin existant: ${existingSuperAdmin.email}`);
      console.log('🛑 Le script s\'arrête pour éviter la duplication.');
      return;
    }

    // Vérifier si l'email est déjà utilisé par un autre utilisateur
    const existingUser = await UserModel.findOne({ email: SUPER_ADMIN_EMAIL });
    
    if (existingUser) {
      console.log(`⚠️  L'email ${SUPER_ADMIN_EMAIL} est déjà utilisé par un autre utilisateur !`);
      console.log(`👤 Utilisateur existant: ${existingUser.firstName} ${existingUser.lastName} (${existingUser.role})`);
      console.log('🛑 Veuillez supprimer cet utilisateur ou utiliser un autre email.');
      return;
    }

    // Créer le super-admin
    console.log('🔧 Création du super-administrateur...');
    
    const superAdmin = new UserModel({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD, // Le middleware pre('save') va le hasher automatiquement
      firstName: 'Super',
      lastName: 'Administrateur',
      role: 'SUPER_ADMIN',
      emailVerified: true,
      onboardingCompleted: true,
      profile: {
        bio: 'Super-administrateur de la plateforme StandUp Connect',
        experience: 99,
        speciality: 'Administration'
      },
      stats: {
        totalEvents: 0,
        totalRevenue: 0,
        averageRating: 5,
        viralScore: 100,
        profileViews: 0,
        lastActivity: new Date(),
        applicationsSent: 0,
        applicationsAccepted: 0,
        applicationsRejected: 0,
        applicationsPending: 0,
        netPromoterScore: 100
      }
    });

    await superAdmin.save();
    
    console.log('✅ Super-administrateur créé avec succès !');
    console.log('');
    console.log('==========================================');
    console.log('🔐 INFORMATIONS DE CONNEXION SUPER-ADMIN');
    console.log('==========================================');
    console.log(`📧 Email: ${SUPER_ADMIN_EMAIL}`);
    console.log(`🔑 Mot de passe: ${SUPER_ADMIN_PASSWORD}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Changez ce mot de passe après la première connexion !');
    console.log('==========================================');
    console.log('');
    console.log(`👤 Nom complet: ${superAdmin.firstName} ${superAdmin.lastName}`);
    console.log(`🆔 ID: ${superAdmin._id}`);
    console.log(`📅 Créé le: ${superAdmin.createdAt}`);
    console.log('✅ Email vérifié: Oui');
    console.log('✅ Onboarding complété: Oui');

  } catch (error) {
    console.error('❌ Erreur lors de la création du super-administrateur:', error);
    process.exit(1);
  } finally {
    // Fermer la connexion à la base de données
    await mongoose.disconnect();
    console.log('🔌 Connexion à la base de données fermée');
    process.exit(0);
  }
}

// Fonction pour afficher l'aide
function showHelp() {
  console.log('');
  console.log('🎭 Script de création du Super-Administrateur - StandUp Connect');
  console.log('==============================================================');
  console.log('');
  console.log('Ce script crée un super-administrateur unique pour la plateforme.');
  console.log('');
  console.log('📧 Email: contact@connectcomedyclub.com');
  console.log('🔑 Mot de passe: SuperAdmin2024!');
  console.log('');
  console.log('🛡️  Sécurité:');
  console.log('  - Vérifie qu\'il n\'y a qu\'un seul super-admin');
  console.log('  - Mot de passe automatiquement hashé');
  console.log('  - Email vérifié par défaut');
  console.log('');
  console.log('💻 Usage:');
  console.log('  npm run seed:super-admin');
  console.log('  ou');
  console.log('  npx ts-node scripts/seedSuperAdmin.ts');
  console.log('');
}

// Gestion des arguments de ligne de commande
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Exécuter le script
createSuperAdmin(); 