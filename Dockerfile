FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tracing.js app.js db.js logger.js repository.js validation.js ./
COPY migrations ./migrations

USER node
EXPOSE 8080

CMD ["node", "--require", "./tracing.js", "./app.js"]
