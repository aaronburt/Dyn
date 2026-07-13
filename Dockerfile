FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Run the server on the default DNS port internally
ENV PORT=53
EXPOSE 53/udp

CMD ["node", "dist/index.js"]
