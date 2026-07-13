FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

USER node

ENV PORT=5353
ENV DOH_PORT=80
EXPOSE 5353/udp
EXPOSE 80/tcp

CMD ["node", "dist/index.js"]
