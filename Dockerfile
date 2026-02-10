FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "mkdir -p /data/catalog /data/resources /data/uploads/lecturers /app/public/uploads && if [ ! -f /data/dev.db ] && [ -f /app/prisma/dev.db ]; then cp /app/prisma/dev.db /data/dev.db; fi && if [ -f /app/data/catalog/Catalog.csv ] && [ ! -f /data/catalog/Catalog.csv ]; then cp /app/data/catalog/Catalog.csv /data/catalog/Catalog.csv; fi && if [ -e /app/public/uploads/lecturers ] && [ ! -L /app/public/uploads/lecturers ]; then rm -rf /app/public/uploads/lecturers; fi && if [ ! -L /app/public/uploads/lecturers ]; then ln -s /data/uploads/lecturers /app/public/uploads/lecturers; fi && npx prisma db push --skip-generate && npm run start"]
