FROM node:20-slim

# Instala Git y limpia basura para que la imagen sea ligera
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos los archivos de dependencias primero (mejor para la caché de Docker)
COPY package*.json ./
RUN npm install

# Copiamos el resto del código (tu index.js, etc.)
COPY . .

# Puerto del panel
EXPOSE 4000

CMD ["node", "index.js"]
