
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
WORKDIR /app
COPY backend ./backend
COPY database ./database
WORKDIR /app/backend
EXPOSE 5000
CMD ["sh","-c","npm run migrate && npm start"]
