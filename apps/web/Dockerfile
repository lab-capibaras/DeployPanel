# Etapa 1: Construcción
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Servidor Nginx
FROM nginx:alpine

# PWA: sw.js e index.html sin caché (si no, los usuarios quedan con una versión vieja);
# /assets lleva hash de Vite, así que se cachea un año; el manifest con su MIME type.
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    location = /sw.js { add_header Cache-Control "no-cache"; } \
    location = /index.html { add_header Cache-Control "no-cache"; } \
    location = /manifest.webmanifest { default_type application/manifest+json; add_header Cache-Control "no-cache"; } \
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; } \
    location / { \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx alpine ya incluye un usuario 'nginx' no-root
# Solo necesitamos ajustar permisos
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
