# Headless Chromium behind a tiny HTTP API (server.mjs): the screenshots the
# site's final visual check reviews.
FROM node:22-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npx playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm
COPY server.mjs ./
USER node
CMD ["node", "server.mjs"]
