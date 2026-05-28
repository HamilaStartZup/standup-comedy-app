FROM node:20-alpine AS build

WORKDIR /app

# Copier package.json et installer dépendances
COPY package*.json ./
RUN npm install

# Copier tout le code
COPY . .

# Copier le fichier .env spécifique à ce build
COPY .env.dev .env

# Build
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

