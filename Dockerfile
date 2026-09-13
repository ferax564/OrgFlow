FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
ENV AUTH_MODE=oidc PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
