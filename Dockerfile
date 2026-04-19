# Dockerfile Backend + Frontend (Easypanel)
FROM node:20-alpine

WORKDIR /app

# Copia e instala dependências
COPY package.json package-lock.json* ./
RUN npm install

# Copia todos os arquivos
COPY . .

# Faz a build do Vite/Frontend
RUN npm run build

# Expõe a porta que o Backend Express vai rodar (3000)
# Configure a App no Easypanel para interceder a porta 3000
EXPOSE 3000

# Executa o servidor backend Node
CMD ["npm", "start"]
