# 🏨 Hotel Contract Management & Pricing Engine

<!-- markdownlint-disable MD033 -->
<p align="center"><img src="https://nestjs.com/img/logo-small.svg" width="80" alt="NestJS Logo" /></p>
<!-- markdownlint-restore MD033 -->

[![NestJS](https://img.shields.io/badge/NestJS-v11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQL Server](https://img.shields.io/badge/SQL%20Server-2022-CC2927?style=flat-square&logo=microsoftsqlserver&logoColor=white)](https://www.microsoft.com/sql-server)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803?style=flat-square&logo=typeorm&logoColor=white)](https://typeorm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> A powerful REST API for managing complex hotel contracts, seasonal pricing matrices, and Tour Operator allotments — built for the hospitality industry.

**Projet de Fin d'Études (PFE)** réalisé pour un **groupe hôtelier majeur**.

---

## 📌 Features

### Référentiel Hôtelier

- Gestion des **Hôtels** (informations légales, coordonnées bancaires, devise par défaut)
- Catalogue de **Types de Chambres** (occupancy min/max, adultes, enfants, lit bébé)
- Configuration des **Arrangements** (BB, HB, FB, AI, RO…)

### Contrats & Saisonnalité

- Création de **Contrats** liés à des **Affiliés** (Tours Opérateurs)
- Définition de **Périodes saisonnières** dynamiques par contrat
- Association flexible **Contrat × Chambre** avec alias personnalisés
- Gestion du cycle de vie des contrats (`DRAFT` → `ACTIVE` → `EXPIRED` / `TERMINATED`)

### Moteur de Tarification Matriciel

- **Matrice Période × Chambre** : chaque intersection génère une ligne de contrat (`ContractLine`)
- **Prix par arrangement** avec séjour minimum et délais de release
- **Suppléments** configurables (par nuit, par séjour, par personne) avec types de valeurs multiples (montant fixe, pourcentage, formule)
- **Promotions** conditionnelles avec montants de réduction
- **Politiques enfants** par tranche d'âge avec réduction (pourcentage, montant fixe, gratuit)

### Gestion de Stock & Distribution

- **Allotements** (quotas de chambres) par ligne de contrat
- Préparation pour la gestion des **Stop-Sales**
- Module **API Partners** pour l'intégration B2B (authentification API Key / Bearer / Basic Auth, rate limiting, IP whitelisting)

---

## 🏗 Architecture

Le projet suit une architecture **modulaire inspirée du Domain-Driven Design (DDD)**, avec une séparation claire des responsabilités :

```text
src/
├── config/              # Configuration (TypeORM, validation env)
├── common/              # Éléments transversaux
│   ├── decorators/      #   Décorateurs custom
│   ├── filters/         #   Filtres d'exception (HttpExceptionFilter)
│   ├── guards/          #   Guards d'authentification/autorisation
│   ├── interceptors/    #   Intercepteurs (logging, transformation)
│   ├── middlewares/     #   Middlewares HTTP
│   ├── pipes/           #   Pipes de validation
│   └── providers/       #   Providers globaux
├── database/            # Migrations et seeds
│   ├── migrations/
│   └── seeds/
├── shared/              # Code partagé entre modules
│   ├── constants/       #   Enums métier (ContractStatus, PaymentType…)
│   └── utils/           #   Utilitaires (DateUtil.isOverlap…)
└── modules/             # Modules métier (bounded contexts)
    ├── auth/            #   Authentification & autorisation
    ├── users/           #   Gestion des utilisateurs & audit
    ├── hotel/           #   Référentiel hôtelier (Hotel, RoomType, Arrangement)
    ├── contract/        #   Contrats, périodes, lignes matricielles
    ├── pricing/         #   Moteur de calcul de prix
    └── api-partners/    #   Intégration partenaires B2B
```

Chaque module contient ses propres **entities**, et exposera à terme ses **DTOs**, **services** et **controllers**.

---

## 🚀 Getting Started

### Prérequis

| Outil | Version requise |
| --- | --- |
| [Node.js](https://nodejs.org/) | ≥ 18.x |
| [pnpm](https://pnpm.io/) | ≥ 8.x (ou npm/yarn) |
| [SQL Server](https://www.microsoft.com/sql-server) | 2019+ |

### Installation

```bash
# Cloner le repository
git clone <repository-url>
cd contracting_backend

# Installer les dépendances
pnpm install
```

### Configuration de l'environnement

Créer un fichier `.env` à la racine du projet :

```env
DB_HOST=localhost
DB_INSTANCE=SQLEXPRESS
DB_PORT=
DB_USERNAME=pricify
DB_PASSWORD=your_secure_password
DB_DATABASE=pricify_db
DB_SYNCHRONIZE=true
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

Voir [LOCAL_SQLSERVER_SETUP.md](./LOCAL_SQLSERVER_SETUP.md) pour la configuration complÃ¨te avec SQL Server Express en local.

> ⚠️ **Sécurité** : Ne jamais commiter le fichier `.env`. Il est exclu via `.gitignore`.
>
> ⚠️ **Production** : Passer `DB_SYNCHRONIZE=false` et utiliser les migrations TypeORM.

### Lancement

```bash
# Mode développement (hot-reload)
pnpm run start:dev

# Mode production
pnpm run build
pnpm run start:prod
```

L'API sera disponible sur `http://localhost:3000`.

---

## 🛠 Database Setup

1. Ouvrir **SQL Server Management Studio (SSMS)** ou **Azure Data Studio**.
2. Créer la base de données :

```sql
CREATE DATABASE hotel_db;
```

1. S'assurer que le compte SQL (`sa` ou un compte dédié) a les droits `db_owner` sur `hotel_db`.
2. Lancer l'application — TypeORM synchronisera automatiquement le schéma si `DB_SYNCHRONIZE=true`.

---

## 🧪 Tests

```bash
# Tests unitaires
pnpm run test

# Tests en mode watch
pnpm run test:watch

# Couverture de code
pnpm run test:cov

# Tests end-to-end
pnpm run test:e2e
```

---

## 📄 License

Ce projet est sous licence [MIT](https://opensource.org/licenses/MIT).

---

## 👨‍💻 Auteur & Contact

**Ahmed Mhenni**
Étudiant en Développement Logiciel — [ISET Sousse](http://www.isetsousse.rnu.tn/)

Projet de Fin d'Études réalisé pour un **groupe hôtelier majeur**.
