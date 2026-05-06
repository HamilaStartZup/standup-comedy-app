# Guide de configuration Domain Authentication SendGrid

## 🎯 Pourquoi c'est essentiel ?

**Domain Authentication** est la configuration la plus importante pour éviter que vos emails atterrissent dans les spams. Sans cette configuration :
- ❌ Les emails sont plus susceptibles d'être marqués comme spam
- ❌ La réputation de votre domaine n'est pas protégée
- ❌ Les fournisseurs d'email (Gmail, Outlook, etc.) ne font pas confiance à vos emails

## 📋 Étapes de configuration

### Étape 1 : Cliquer sur "Get Started" dans Domain Authentication

1. Dans SendGrid, allez dans **Settings > Sender Authentication**
2. Dans la section **Domain Authentication**, cliquez sur **"Get Started"**

### Étape 2 : Entrer votre domaine

1. SendGrid vous demandera d'entrer votre domaine
2. **Option recommandée** : Utilisez un sous-domaine dédié pour les emails
   - Exemple : `mail.standup-comedy-app.com` ou `noreply.standup-comedy-app.com`
   - Cela évite d'affecter votre domaine principal
3. **Alternative** : Vous pouvez utiliser votre domaine principal si vous préférez

### Étape 3 : Ajouter les enregistrements DNS

SendGrid va générer plusieurs enregistrements DNS que vous devrez ajouter à votre domaine :

#### Types d'enregistrements à ajouter :

1. **CNAME Records** (plusieurs)
   - SendGrid génère plusieurs CNAME pour l'authentification
   - Exemple : `em1234.yourdomain.com` → `sendgrid.net`

2. **TXT Record pour SPF**
   - Exemple : `v=spf1 include:sendgrid.net ~all`

3. **TXT Record pour DKIM**
   - SendGrid génère une clé DKIM unique
   - Exemple : `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3...`

4. **TXT Record pour DMARC** (optionnel mais recommandé)
   - Exemple : `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`

### Étape 4 : Ajouter les enregistrements dans votre DNS

**Où ajouter ces enregistrements ?**

Cela dépend de votre hébergeur DNS :
- **Netlify** : Netlify DNS (si vous utilisez Netlify pour le domaine)
- **Cloudflare** : Dashboard Cloudflare > DNS
- **Google Domains** : Google Domains > DNS
- **Autre hébergeur** : Consultez la documentation de votre hébergeur

**Comment ajouter ?**

1. Connectez-vous à votre panneau DNS
2. Ajoutez chaque enregistrement CNAME et TXT que SendGrid vous a fournis
3. **Important** : Respectez exactement les noms et valeurs fournis par SendGrid
4. Sauvegardez les modifications

### Étape 5 : Vérification dans SendGrid

1. Retournez dans SendGrid
2. Cliquez sur **"Verify"** ou **"Check DNS Records"**
3. SendGrid va vérifier que tous les enregistrements DNS sont correctement configurés
4. ⏱️ **Note** : La propagation DNS peut prendre de 5 minutes à 48 heures (généralement moins d'1 heure)

### Étape 6 : Mettre à jour votre code

Une fois la vérification réussie, vous devez mettre à jour l'adresse email utilisée dans votre code :

**Fichier à modifier** : `server/src/config/env.ts` ou variables d'environnement

```env
# Avant (email Gmail vérifié)
SMTP_USER=contact@connectcomedyclub.com

# Après (utiliser votre domaine authentifié)
SMTP_USER=noreply@mail.standup-comedy-app.com
# ou
SMTP_USER=noreply@standup-comedy-app.com
```

**Important** : L'email doit être sur le domaine que vous avez authentifié dans SendGrid.

## 🔍 Vérification de la configuration

### Dans SendGrid :
- ✅ Le statut doit passer à "Verified" (vérifié)
- ✅ Tous les enregistrements DNS doivent être marqués comme valides

### Test d'envoi :
1. Envoyez un email de test
2. Vérifiez les en-têtes de l'email reçu
3. Recherchez "SPF: PASS", "DKIM: PASS", "DMARC: PASS"

### Outils de vérification :
- **Mail-Tester.com** : Testez votre configuration et obtenez un score
- **MXToolbox** : Vérifiez vos enregistrements SPF, DKIM, DMARC
- **Google Postmaster Tools** : Surveillez votre réputation Gmail

## ⚠️ Problèmes courants

### 1. Les enregistrements DNS ne sont pas détectés
- **Solution** : Attendez 15-30 minutes pour la propagation DNS
- Vérifiez que vous avez bien copié les valeurs exactes
- Assurez-vous que vous avez ajouté les enregistrements au bon domaine

### 2. Erreur "Domain already in use"
- **Solution** : Un autre compte SendGrid ou service utilise peut-être ce domaine
- Contactez le support SendGrid si nécessaire

### 3. Erreur de vérification
- **Solution** : Vérifiez que tous les CNAME et TXT sont correctement ajoutés
- Utilisez un outil comme `dig` ou `nslookup` pour vérifier la propagation

## 📊 Après la configuration

Une fois Domain Authentication configuré :

1. ✅ Vos emails auront une meilleure délivrabilité
2. ✅ Moins d'emails dans les spams
3. ✅ Meilleure réputation de domaine
4. ✅ Les fournisseurs d'email vous feront plus confiance

## 🔗 Ressources supplémentaires

- [Documentation SendGrid - Domain Authentication](https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication)
- [Guide SPF, DKIM, DMARC](https://www.mail-tester.com/spf-dkim-check)
- [Test de délivrabilité](https://www.mail-tester.com/)

## 📝 Notes importantes

- **Ne supprimez jamais** les enregistrements DNS une fois configurés (sauf si vous changez de service)
- **Domain Authentication** est préférable à **Single Sender Verification** car il protège tout votre domaine
- La configuration peut prendre jusqu'à 48h pour être complètement propagée, mais généralement c'est beaucoup plus rapide

