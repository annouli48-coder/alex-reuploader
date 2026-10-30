FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/app.mjs"]
