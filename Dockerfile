# Estágio de Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia os arquivos de dependência
COPY package.json package-lock.json* ./

# Instala as dependências
RUN npm install

# Copia o restante dos arquivos
COPY . .

# Constrói o aplicativo para produção (gera os arquivos estáticos na pasta dist)
RUN npm run build

# Estágio de Produção (Servidor Web NGINX)
FROM nginx:alpine

# Remove a configuração padrão do NGINX
RUN rm /etc/nginx/conf.d/default.conf

# Copia a configuração personalizada para SPA
COPY nginx.conf /etc/nginx/conf.d/

# Copia os arquivos compilados (da pasta dist) para a pasta pública do NGINX
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe a porta 80 que será mapeada e reconhecida automaticamente pelo Easypanel
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
