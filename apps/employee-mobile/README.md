# Mshahara — App mobile employés (pointage)

Application **Expo / React Native** pour les collaborateurs : badger entrée/sortie, historique, profil.

## Démarrer

```bash
cd apps/employee-mobile
npm install
npm start
```

Puis :
- scanner le QR code avec **Expo Go** (Android / iOS), ou
- appuyer sur `a` (Android émulateur) / `i` (iOS simulateur)

Le fichier `.env` contient déjà l’URL Supabase et la clé anon.

## Écrans

| Écran | Rôle |
|-------|------|
| Login | Connexion compte employé (email / mot de passe RH) |
| Pointage | Entrée / Sortie du jour (+ GPS optionnel) |
| Historique | Présences du mois |
| Profil | Infos RH + déconnexion |

## API

Les appels passent par les RPC Supabase `mobile_*` (voir `src/lib/api/mobile.ts`).
