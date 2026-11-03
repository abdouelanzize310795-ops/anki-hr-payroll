# Rapport de tests Mshahara — 3 novembre 2026

Tests de A à Z avant la mise en production : sécurité, données, parcours métier par rôle, API mobile, PDF, version de production.

## Verdict

**Mshahara n'était pas prêt pour la production ce matin : il l'est beaucoup plus maintenant, sous conditions.**
J'ai trouvé et corrigé **7 failles de sécurité graves** (dont une qui laissait chaque salarié lire les salaires et bulletins de tous ses collègues) et **9 bugs**. Tout est vérifié après correction. Il reste des points à traiter avant d'ouvrir à de vrais clients (section « À faire avant la production »).

Rien n'est encore commité ni poussé sur GitHub.

---

## 1. Failles de sécurité corrigées

| # | Gravité | Problème | Correction | Vérifié |
|---|---|---|---|---|
| 1 | **Critique** | Un **salarié pouvait lire les 479 bulletins de ses collègues**, les 50 contrats, tous les salaires et toutes les demandes de congé de son entreprise (d'anciennes règles d'accès trop larges s'ajoutaient aux règles strictes). | Migration `20260727000000_tighten_member_rls.sql` : chacun ne voit que ses données, le manager son équipe, l'employeur/RH toute l'entreprise. | Salarié : 1 fiche, 12 bulletins, 1 contrat. Employeur et RH : tout (50 / 479). |
| 2 | **Critique** | Un salarié pouvait **modifier ou supprimer n'importe quelle demande de congé** (y compris approuver la sienne) et **réécrire ses heures de pointage**. | Même migration : écriture des congés réservée aux valideurs, pointages modifiables seulement par l'employeur/RH. | Oui |
| 3 | **Critique** | Un employeur pouvait **prolonger lui-même son abonnement** (10 ans testés), approuver ou réactiver son entreprise. | Migration `…000100_protect_company_billing_fields.sql` : ces champs ne changent que par l'administrateur ou le circuit de paiement. | Tentative refusée ; modification normale et déclaration de paiement OK. |
| 4 | Haute | Un salarié voyait la **masse salariale totale** de l'entreprise (24,5 M KMF / mois) via les cycles de paie. | Migration `…000200_payroll_runs_staff_only.sql` + fonction `payslip_runs()` qui ne donne que la période de ses propres bulletins. | Salarié : 0 cycle, ses 12 périodes seulement, même en demandant les bulletins des autres. |
| 5 | Haute | Un manager voyait **les contrats (salaires) de toute l'entreprise**. | Migration `…000300_contracts_manager_team_only.sql`. | 50 → 14 (son équipe). |
| 6 | Haute | Les utilisateurs pouvaient lire la table des comptes avec les **mots de passe chiffrés** et jetons de récupération. | `db/00_compat.sql` + migration `…000400_revoke_auth_users.sql`. | Aucun accès. |
| 7 | Haute | **Pages interdites accessibles** en tapant l'adresse : un salarié ouvrait Comptabilité, Virements, Employés, Abonnements… | `src/routes/_app.tsx` : contrôle par rôle (le menu ne faisait que cacher les liens). | — (les pages renvoient au tableau de bord) |
| 8 | Moyenne | **Aucune limite d'essais de mot de passe** (web et mobile). | `src/lib/db/auth.ts` : 5 échecs → compte bloqué 15 min. | 6e essai refusé (429), même avec le bon mot de passe. |
| 9 | Moyenne | **Pas de protection CSRF** sur les fonctions serveur. | `src/start.ts`. | Appel venant d'un autre site → 403. |
| 10 | Moyenne | N'importe quel compte connecté pouvait **déposer un logo** dans le dossier d'une autre entreprise. | `company.functions.ts` : vérification du droit de gérer l'entreprise. | — |
| 11 | Moyenne | Une session volée pouvait **changer le mot de passe sans l'ancien**. | `auth.functions.ts` : uniquement pour les comptes qui doivent changer leur mot de passe provisoire. | — |
| 12 | Moyenne | Validation médicale d'un congé **sans contrôle du rôle**. | Couvert par la correction n°2. | — |

## 2. Bugs corrigés

| Bug | Correction |
|---|---|
| **Création d'un salarié impossible** après avoir créé un département dans le formulaire (blocage silencieux, aucun message). Même défaut dans le formulaire de contrat. | `EmployeeForm.tsx`, `ContractForm.tsx` |
| **Double scan du QR** : un 2e scan juste après l'entrée enregistrait la sortie (0 min travaillée, « départ anticipé de 1353 min »). | Migration `…000500_clock_double_scan_guard.sql` : 5 min minimum entre entrée et sortie. |
| Nouvelle entreprise **sans types de congés** tant que personne n'ouvrait la page Congés : ses salariés ne pouvaient rien demander depuis le mobile. | Migration `…000700_default_leave_types_on_company.sql` (création automatique + rattrapage). |
| Pointage et helpdesk web : le salarié connecté **n'était pas reconnu comme lui-même** (pointage pouvant viser le 1er salarié de la liste). | `_app.attendance.tsx`, `_app.helpdesk.tsx` |
| « Ma paie » affichait au salarié des **bulletins encore en brouillon**. | `payroll.functions.ts` : seulement les bulletins validés ou payés (comme le mobile). |
| Statistique « délai moyen d'embauche » toujours vide (faute de frappe). | `recruitment.functions.ts` |
| Erreur d'affichage HTML sur la page Pointage (erreur d'hydratation). | `_app.attendance.tsx` |
| Restes de l'ancien nom : codes de paiement « **ANKI-** », exemple « SARL Ankiba Services ». | Migration `…000600_payment_code_prefix.sql` (nouveaux codes « MSH- »), `CompanyForm.tsx` |
| Déplacer un bulletin dans la vitrine de la page d'accueil saccadait. | `src/routes/index.tsx` (animation fluide, 60 images/s) |

## 3. Ce qui a été testé et fonctionne

- **Paie (Innvo, 479 bulletins)** : brut = somme des gains, net = brut − retenues, aucun net négatif, IGR conforme au barème sur 469 bulletins, virements = nets, aucun doublon.
- **Cycle de paie complet** (novembre, en transaction annulée) : création → calcul (48 salariés, 24,9 M brut) → approbation → lot de 48 virements au bon total.
- **Congés** : demande mobile, refus des chevauchements, des dates inversées et des soldes insuffisants ; validation en 2 étapes (manager puis RH) ; solde mis à jour ; annulation RH qui rend les jours.
- **Pointage sécurisé** : refus du téléphone non approuvé, de la fausse position GPS, de la position hors site, du GPS imprécis, du QR falsifié et hors des horaires ; entrée et sortie normales OK.
- **Données automatiques** : aucune absence un week-end, un jour férié, pendant un congé ou hors contrat ; 102 soldes de congés cohérents.
- **Isolation entre entreprises** : aucun accès aux données d'une autre entreprise, ni en lecture ni en écriture.
- **API mobile** : 13 fonctions OK, fonctions manager refusées au salarié, bulletins des collègues et d'autres entreprises refusés (API et PDF).
- **Pages web** : les 23 pages s'ouvrent sans erreur pour l'employeur ; pages du salarié limitées à ses données.
- **Inscription d'une nouvelle entreprise** : compte → entreprise (modèle de bulletin choisi bien enregistré) → blocage tant que non payé → déclaration de paiement → refus de l'auto-validation → validation admin → espace ouvert → création d'un salarié.
- **Version de production** (`Dockerfile.prod`) : démarre, applique les migrations, pages en 0,2–0,5 s (15–20 s en dev), PDF en 8 s, aucun fichier source ou secret accessible.
- **APK** du 3 novembre : contient uniquement `https://mshahara.online`.

## 4. À faire avant la production

1. **Déployer la version de production**, jamais `vite dev` (lent et expose le code source).
2. **Ajouter « Mot de passe oublié »** : aujourd'hui un utilisateur qui perd son mot de passe dépend entièrement d'un admin.
3. **Changer tous les mots de passe** des comptes de test et de l'admin (un tunnel public a été ouvert avant les corrections), et utiliser de nouveaux secrets sur le VPS.
4. **Corriger le DNS** : `mshahara.online` pointe encore vers `213.255.195.58`, pas vers le VPS `169.58.114.169` (supprimer aussi l'enregistrement AAAA).
5. **Sauvegardes** quotidiennes de la base et du dossier des fichiers, copiées hors du VPS.

## 5. Points restants, non corrigés

- **Arrondis** : les montants sont gardés avec des décimales, d'où un écart de 1 KMF entre le net affiché et le brut moins les retenues affichées (ex. 599 492 au lieu de 599 491). Recommandé : arrondir chaque ligne au franc.
- Un **manager voit toutes les demandes de congé** de l'entreprise (règle de validation actuelle) ; à limiter à son équipe si ce n'est pas voulu.
- Tâches, offres d'emploi, formations et matériel restent **visibles par tous les membres** de l'entreprise (probablement voulu).
- Le blocage après 5 essais est **en mémoire** : remis à zéro au redémarrage, et basé sur l'e-mail (un attaquant peut bloquer un compte 15 min).
- **Inscription ouverte** sans vérification d'e-mail ni anti-robot : risque de faux comptes.
- Message mobile « Acces refuse » sans accents ni explication quand un salarié tente d'annuler un congé déjà approuvé.
- La liste « Managers de département » ne se rafraîchit pas tout de suite après l'ajout d'un département.
- Certaines pages chargent les mêmes données 2 à 3 fois (performance).
- 11 erreurs de typage TypeScript dans les formulaires (sans effet à l'exécution).

## 6. Non testé

- **Console d'administration web** dans le navigateur (l'accès aux identifiants admin a été refusé) ; la validation d'entreprise a été testée directement dans la base.
- **L'app mobile sur le téléphone** (le serveur de production n'est pas encore en ligne).
- Import CSV, recrutement, formation, évaluations, tickets helpdesk, envoi de documents, écran d'affichage du QR, installation sur le VPS (Caddy, HTTPS).

## 7. Données de test laissées dans la base locale

- Entreprise **« QA Test Entreprise SARL »** (compte `qa.inscription@mshahara.test`, identifiants dans `test-accounts.local`) et sa salariée « Fatima Test QA » — à supprimer.
- Le compte de test **Amina** a été bloqué 15 min par le test des essais de mot de passe (débloqué depuis).
- La demande de congé et les pointages de test sur Innvo ont été supprimés ou annulés.

## 8. Fichiers modifiés

Code : `src/start.ts`, `src/routes/_app.tsx`, `src/routes/_app.attendance.tsx`, `src/routes/_app.helpdesk.tsx`, `src/routes/index.tsx`, `src/styles.css`, `src/lib/db/auth.ts`, `src/lib/db/http-api.ts`, `src/lib/auth/auth.functions.ts`, `src/modules/payroll/payroll.functions.ts`, `src/modules/companies/company.functions.ts`, `src/modules/companies/components/CompanyForm.tsx`, `src/modules/employees/components/EmployeeForm.tsx`, `src/modules/contracts/components/ContractForm.tsx`, `src/modules/recruitment/recruitment.functions.ts`, `src/modules/ai/help-guides.ts`, `db/00_compat.sql`, app mobile (`app/login.tsx`, `src/lib/supabase.ts`).

Migrations : `20260727000000` à `20260727000700` (8 fichiers) dans `supabase/migrations/`.

---

## Mise à jour — corrections des points restants et sauvegarde (3 novembre, suite)

| Point du rapport | État |
|---|---|
| Arrondis (écart de 1 KMF) | **Corrigé** — chaque ligne de bulletin est arrondie au franc ; vérifié sur un cycle de 48 bulletins : 0 ligne à décimales, net = brut − retenues partout. Les bulletins déjà calculés gardent leurs anciens montants (recalcul possible en rouvrant le cycle). |
| Manager voyant toutes les demandes de congé | **Corrigé** — 48 → 17 (son équipe). |
| Blocage des connexions en mémoire | **Corrigé** — enregistré en base (`login_throttle`), il tient après un redémarrage. |
| Message mobile « Acces refuse » | **Corrigé** — « Ce congé est déjà approuvé. Pour l’annuler, adressez-vous à votre manager ou aux RH. » |
| Liste des managers de département non rafraîchie | **Corrigé** |
| 11 erreurs TypeScript | **Corrigé** — 0 erreur. |
| Données de test QA | **Supprimées** (entreprise, comptes, lignes de `test-accounts.local`). |
| « Mot de passe oublié » et vérification d’e-mail à l’inscription | **Fait** — actifs dès que les réglages SMTP de l’hébergeur sont dans `.env.local` (expéditeur `contact@mshahara.online`). |
| Chargements en double de certaines pages | **Réduit** — le badge de notifications ne se recharge plus qu’une fois par minute. |

Migration ajoutée : `20260728000000_review_fixes.sql`.

### Sauvegarde et restauration complètes (console administrateur)

- Bouton **« Sauvegarder maintenant »** : un ZIP avec toute la base (entreprises, comptes et mots de passe, employés, paie, pointages, congés, sessions, historique des migrations) et tous les fichiers envoyés (logos, documents).
- **Télécharger** chaque sauvegarde pour la garder hors du serveur.
- **Restaurer** une sauvegarde de la liste ou un ZIP envoyé : mot de passe administrateur + saisie « RESTAURER » obligatoires. Tout l’état actuel est d’abord sauvegardé automatiquement (« Avant restauration »), puis la base et les fichiers sont remplacés en une seule opération : en cas d’erreur, rien n’est modifié.
- **Sauvegarde automatique** chaque jour (7 conservées), dans le volume Docker `backups`.
- Testé : sauvegarde (3,4 Mo, 1,6 s) → suppression volontaire de données et ajout d’un fichier → restauration (6,6 s) : compteurs, montants, fichiers, 76 règles de sécurité et droits **identiques** à l’avant-incident.
- Accès refusé aux salariés et sans session ; noms de fichiers piégés refusés.
- **Non testé dans le navigateur** : le panneau de la console admin (il faut un compte administrateur plateforme ; la promotion d’un compte de test m’a été refusée).

### Mot de passe oublié, confirmation d’e-mail, blocage par IP (suite)

- **Mot de passe oublié** : lien « Mot de passe oublié ? » sur la connexion → e-mail avec un lien valable 1 h, à usage unique → nouveau mot de passe. Toutes les sessions sont fermées et les blocages levés. La réponse est la même qu’un compte existe ou non ; 3 demandes maximum par heure.
- **Confirmation d’adresse** à l’inscription : connexion refusée tant que le lien (valable 48 h) n’est pas cliqué, avec un bouton « Renvoyer le lien ». Les comptes créés par les RH ne sont pas concernés.
- **Blocage** : 5 essais par couple e-mail + adresse IP, 30 essais toutes IP confondues. Testé : l’attaquant est bloqué (429), le titulaire se connecte normalement depuis son IP.
- Testé en local avec les e-mails écrits dans le journal (`SMTP_HOST=log`) : demande, lien, changement, ancien mot de passe refusé, lien inutilisable ensuite ; inscription → refus → confirmation → connexion. **L’envoi réel par l’hébergeur n’est pas testé** (réglages SMTP à fournir).
- Migration : `20260728000100_email_tokens.sql`.

### Comptes créés par les RH : e-mail de bienvenue et changement obligatoire

- **Bug corrigé** : le changement de mot de passe à la première connexion était prévu mais jamais déclenché — les fonctions de création de compte n’activaient pas `must_change_password`. Un salarié pouvait garder le mot de passe provisoire.
- À chaque création de compte par les RH (fiche employé, activation de contrat, compte RH/manager), le compte est marqué « mot de passe à changer » et la personne reçoit un e-mail « Votre compte Mshahara est prêt » : adresse de connexion, identifiant, mot de passe provisoire, rappel de l’app mobile. L’écran du RH indique si l’e-mail est parti ; sinon le mot de passe reste affiché pour être transmis.
- **Web** : la page de changement obligatoire existante s’affiche dès la connexion.
- **App mobile** : nouvel écran « Première connexion » qui bloque l’accès tant que le mot de passe n’est pas changé (vérifie le mot de passe provisoire, refuse un mot de passe trop court ou identique ; les autres sessions sont fermées).
- Testé : création par le RH → e-mail produit → indicateur actif → 1re connexion mobile → refus des cas invalides → changement → indicateur levé, ancien mot de passe refusé.

