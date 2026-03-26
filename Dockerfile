# ============================================================
# Pricify — Backend NestJS
# Multi-stage Dockerfile : Development + Builder + Runner
# ============================================================

# ──────────────────────────────────────────
# STAGE 1 : development
# Image complète avec TOUTES les dépendances (dev incluses)
# Utilisée par docker-compose (target: development) pour le hot-reload
# ──────────────────────────────────────────
FROM node:24-alpine AS development

# Installer pnpm globalement
RUN npm install -g pnpm

WORKDIR /app

# Copier les manifestes de dépendances en premier
# (optimisation du cache Docker : layer réutilisé si pas de changement)
COPY package.json pnpm-lock.yaml ./

# Installer TOUTES les dépendances (dev incluses, nécessaires pour la compile)
RUN pnpm install --frozen-lockfile

# Copier le reste des sources
COPY . .

# --- FIN DE L'ÉTAPE DEVELOPMENT ---
# En mode dev, docker-compose surcharge la CMD avec `pnpm run start:dev`
# et monte le code local via un volume → hot-reload activé.

# ──────────────────────────────────────────
# STAGE 2 : builder (compilation pour la prod)
# Hérite de development (dépendances déjà installées)
# ──────────────────────────────────────────
FROM development AS builder

# Compiler TypeScript → dist/
RUN pnpm run build

# Supprimer les devDependencies pour alléger l'image de production
RUN pnpm prune --prod

# ──────────────────────────────────────────
# STAGE 3 : runner (image finale, légère)
# Ne contient que le code compilé + dépendances de prod
# ──────────────────────────────────────────
FROM node:24-alpine AS runner

# Installer pnpm et dumb-init (gestion propre des signaux UNIX en prod)
RUN npm install -g pnpm && apk add --no-cache dumb-init

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

WORKDIR /app

# Copier uniquement les artefacts nécessaires depuis le builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Passer sur l'utilisateur non-root
USER nestjs

# Exposer le port de l'API (doit correspondre à la variable PORT dans .env)
EXPOSE 3000

# Healthcheck : vérifie que l'API répond toutes les 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Démarrage avec dumb-init pour une gestion propre des signaux (SIGTERM)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
