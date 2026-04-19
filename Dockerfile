# Imagem do Node para rodar tanto o Frontend quanto a API (PostgreSQL)
FROM node:20-alpine

WORKDIR /app

# Copia dependências e instala
COPY package.json package-lock.json* ./
RUN npm install

# Copia os arquivos do projeto
COPY . .

# Compila o frontend React (Vai gerar a pasta "dist")
RUN npm run build

# Expõe a porta 3000 (O Easypanel vai ler essa porta automaticamente)
EXPOSE 3000

# Executa o servidor Node (server.ts express)
# O Express vai cuidar da rota /api e servir a pasta /dist para o Frontend
CMD ["npm", "start"]
