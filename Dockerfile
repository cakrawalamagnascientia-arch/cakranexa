# CakraNexa — server Express + frontend untuk Render (runtime Docker).
# Menyertakan alat sistem untuk produk digital fase 2:
#   ffmpeg        : audiobook -> HLS AES-128
#   poppler-utils : pdftoppm (render halaman) & pdftotext (teks pencarian)
#   fonts-dejavu  : font watermark halaman e-book (sharp/librsvg)

# ---- Build -----------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
# Variabel VITE_* dibaca saat build frontend. Render meneruskan environment variable service
# sebagai build argument untuk ARG yang dideklarasikan di sini.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_MIDTRANS_CLIENT_KEY
ARG VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_MIDTRANS_CLIENT_KEY=$VITE_MIDTRANS_CLIENT_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build && npm prune --omit=dev

# ---- Runtime ---------------------------------------------------------------
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg poppler-utils fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
