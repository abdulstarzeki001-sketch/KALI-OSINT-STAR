FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json gateway.mjs server.mjs ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.mjs"]
