FROM tailscale/tailscale:stable AS tailscale
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscaled /usr/local/bin/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node gateway.mjs server.mjs access-jwt.mjs deep-audit.mjs ./
COPY --chown=node:node start.sh tailnet-provider.mjs ./
USER node
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/sbin/tini","-s","-g","--"]
CMD ["/bin/sh","/app/start.sh"]
