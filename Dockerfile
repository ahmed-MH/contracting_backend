# ============================================================
# Pricify — Backend NestJS
# Multi-stage Dockerfile : Builder + Runner (Node Alpine)
# ============================================================

# ──────────────────────────────────────────
# STAGE 1 : builder
# Installe les dépendances et compile le TS
# ──────────────────────────────────────────
FROM node:24-alpine AS builder

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

# Compiler TypeScript → dist/
RUN pnpm run build

# ──────────────────────────────────────────
# STAGE 2 : runner (image finale, légère)
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
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Démarrage avec dumb-init pour une gestion propre des signaux (SIGTERM)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
