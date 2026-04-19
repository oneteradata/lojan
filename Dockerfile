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

# Imagem do Node para rodar tanto o Frontend quanto a API (PostgreSQL)
FROM node:20-alpine

WORKDIR /app

# 1. Força o modo de desenvolvimento durante o build. 
# Isso impede que o Easypanel bloqueie a instalação das devDependencies (necessárias para o Vite e TSX)
ENV NODE_ENV=development

# 2. Copia dependências e instala
COPY package.json package-lock.json* ./
RUN npm install

# 3. Copia os arquivos do projeto
COPY . .

# 4. Compila o frontend React (Vai gerar a pasta "/dist")
RUN npm run build

# 5. Define como modo de Produção para o Runtime!
# Isso avisa para o server.ts que ele NÃO DEVE usar o modo dev do middleware do Vite, e sim injetar os arquivos estáticos
ENV NODE_ENV=production
ENV PORT=3000

# 6. Expõe a porta 3000 
EXPOSE 3000

# 7. Executa o servidor Node Fullstack (Express)
CMD ["npm", "start"]
