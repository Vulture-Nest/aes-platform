# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# --- Runtime stage ---
# nginx 1.27 is a FROZEN tag — last published 2025-04-16 — so it can never
# receive a security fix. That mattered on 2026-11-18, when CVE-2026-123633 and
# CVE-2026-123007 (both critical, unauthenticated RCE) were disclosed against
# nginx; the fixes landed in 1.30.7 stable and 1.31.9 mainline only. Rebuilding
# against 1.27-alpine would have looked like remediation and changed nothing.
# Pin to a minor line that is still maintained, and bump it when 1.30 retires.
FROM nginx:1.30-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
