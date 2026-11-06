FROM node:22-slim
# Chromium renders payslips to PDF with the employer's template.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
# PostgreSQL 16 client (same major version as the database) and zip/unzip for
# full-system backups and restores.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg zip unzip  && install -d /usr/share/postgresql-common/pgdg  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "node db/migrate.mjs && node db/seed.mjs && npx vite dev --host 0.0.0.0 --port 8080"]
