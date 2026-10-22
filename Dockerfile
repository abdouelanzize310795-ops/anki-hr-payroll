FROM node:22-slim
# Chromium renders payslips to PDF with the employer's template.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "node db/migrate.mjs && node db/seed.mjs && npx vite dev --host 0.0.0.0 --port 8080"]
