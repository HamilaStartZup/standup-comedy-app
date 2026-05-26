# Stripe – Paiement des places spectateur (1€)

## Variables d'environnement

- **STRIPE_SECRET_KEY** : clé secrète Stripe (sk_test_... en test, sk_live_... en production). Déjà renseignée dans `.env`.
- **STRIPE_WEBHOOK_SECRET** : secret de signature des webhooks. À configurer pour que l’inscription soit enregistrée automatiquement après paiement.

## En local (sans webhook)

L’inscription est quand même enregistrée au retour du spectateur sur la page « Mes évènements » : le client appelle `GET /api/stripe/confirm-registration?session_id=...`, le serveur vérifie la session Stripe et inscrit le spectateur. Vous pouvez donc tester sans configurer le webhook.

## Configurer le webhook (recommandé en production)

1. **Dashboard Stripe** → Développeurs → Webhooks → Ajouter un endpoint.
2. **URL** : `https://votre-api.com/api/stripe/webhook`
3. **Événements** : cocher `checkout.session.completed`.
4. Copier le **Secret de signature** (whsec_...) dans `.env` : `STRIPE_WEBHOOK_SECRET=whsec_...`.

En local avec Stripe CLI :

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Le CLI affiche un secret (whsec_...) à mettre dans `STRIPE_WEBHOOK_SECRET`.

## Flux

1. Le spectateur clique sur « Je participe pour 1€ » → le client appelle `POST /api/stripe/create-checkout-session` avec l’`eventId`.
2. Le serveur crée une session Stripe Checkout (1€, métadonnées `eventId` + `userId`) et renvoie l’URL.
3. Le client redirige vers Stripe ; après paiement, Stripe redirige vers `/spectateur/events?payment=success&session_id=...`.
4. **Webhook** : Stripe envoie `checkout.session.completed` → le serveur inscrit le spectateur à l’événement.
5. **Secours** : à l’arrivée sur la page avec `session_id`, le client appelle `GET /api/stripe/confirm-registration?session_id=...` pour confirmer l’inscription si le webhook n’a pas encore été traité (ou si le webhook n’est pas configuré).
