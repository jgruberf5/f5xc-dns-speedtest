FROM node:16-alpine

ENV NODE_ENV development
ENV F5_XC_API_KEY bogus
ENV F5_XC_TENANT bogus
ENV F5_XC_DNS_MONITOR_NAMESPACE default
ENV F5_XC_DNS_MONITOR_PREFIX test
ENV F5_XC_F5_MONITOR_SUFFIX test

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

WORKDIR /app
COPY . .

EXPOSE 3000
CMD ["node", "./build"]