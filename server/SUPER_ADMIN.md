# 🎭 Super-Administrateur - StandUp Connect

## 📋 Vue d'ensemble

Le système de super-administrateur permet de créer un compte administrateur unique avec des privilèges élevés pour la gestion de la plateforme StandUp Connect.

## 🔐 Caractéristiques de sécurité

- **Unicité garantie** : Un seul super-admin peut exister dans la base de données
- **Création sécurisée** : Seul accessible via script de seeding (jamais via l'interface publique)
- **Mot de passe hashé** : Utilise bcryptjs avec un sel de niveau 10
- **Email vérifié** : Le compte est automatiquement vérifié
- **Onboarding complété** : Prêt à utiliser immédiatement

## 🚀 Utilisation du script de seeding

### Prérequis
- Node.js et npm installés
- Base de données MongoDB configurée
- Variables d'environnement configurées (DATABASE_URL)

### Exécution

```bash
# Depuis le dossier server/
npm run seed:super-admin

# Ou directement avec ts-node
npx ts-node scripts/seedSuperAdmin.ts

# Pour afficher l'aide
npx ts-node scripts/seedSuperAdmin.ts --help
```

### Informations de connexion créées

- **📧 Email** : `contact@connectcomedyclub.com`
- **🔑 Mot de passe** : `SuperAdmin2024!`
- **👤 Rôle** : `SUPER_ADMIN`

⚠️ **IMPORTANT** : Changez le mot de passe après la première connexion !

## 🛡️ Vérifications de sécurité

Le script effectue plusieurs vérifications avant la création :

1. **Vérification de l'unicité** : S'assure qu'aucun super-admin n'existe déjà
2. **Vérification d'email** : S'assure que l'email n'est pas déjà utilisé par un autre utilisateur
3. **Connexion DB** : Vérifie la connexion à la base de données
4. **Variables d'environnement** : Vérifie que DATABASE_URL est configurée

## 📊 Données créées

Le super-admin est créé avec :

```json
{
  "email": "contact@connectcomedyclub.com",
  "firstName": "Super",
  "lastName": "Administrateur",
  "role": "SUPER_ADMIN",
  "emailVerified": true,
  "onboardingCompleted": true,
  "profile": {
    "bio": "Super-administrateur de la plateforme StandUp Connect",
    "experience": 99,
    "speciality": "Administration"
  },
  "stats": {
    "viralScore": 100,
    "averageRating": 5,
    "netPromoterScore": 100
    // ... autres stats à 0
  }
}
```

## 🔧 Modification du modèle User

Le script a automatiquement ajouté le rôle `SUPER_ADMIN` aux enums dans :

- `server/src/models/User.ts`
- `server/src/types/user.ts`

## 🚨 Messages d'erreur

### Super-admin déjà existant
```
⚠️  Un super-administrateur existe déjà !
📧 Email du super-admin existant: contact@connectcomedyclub.com
🛑 Le script s'arrête pour éviter la duplication.
```

### Email déjà utilisé
```
⚠️  L'email contact@connectcomedyclub.com est déjà utilisé par un autre utilisateur !
👤 Utilisateur existant: John Doe (ORGANIZER)
🛑 Veuillez supprimer cet utilisateur ou utiliser un autre email.
```

### Base de données non configurée
```
❌ DATABASE_URL n'est pas définie dans les variables d'environnement
```

## 🔄 Re-exécution

- Si un super-admin existe déjà, le script s'arrête sans modification
- Pour recréer un super-admin, vous devez d'abord supprimer l'existant manuellement de la base de données
- Le script peut être exécuté plusieurs fois sans risque

## 🛠️ Dépannage

### Problème de connexion à la DB
1. Vérifiez que MongoDB est en cours d'exécution
2. Vérifiez votre variable d'environnement `DATABASE_URL`
3. Vérifiez les permissions de connexion

### Erreur de compilation TypeScript
1. Assurez-vous que toutes les dépendances sont installées : `npm install`
2. Vérifiez que ts-node est installé : `npm install -g ts-node`

### Mot de passe oublié
Si vous oubliez le mot de passe du super-admin :
1. Supprimez l'utilisateur super-admin de la base de données
2. Re-exécutez le script de seeding
3. Utilisez le nouveau mot de passe affiché

## 📝 Logs

Le script affiche des logs détaillés pour chaque étape :
- 🚀 Démarrage
- ✅ Connexion DB réussie
- 🔧 Création en cours
- ✅ Succès avec informations de connexion
- 🔌 Fermeture de connexion

## 🔒 Bonnes pratiques

1. **Changez le mot de passe** après la première connexion
2. **Gardez les informations de connexion sécurisées**
3. **N'exécutez le script qu'en cas de besoin**
4. **Documentez qui a accès au super-admin**
5. **Activez la double authentification** si disponible dans l'interface 