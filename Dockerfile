# Stage 1: Build
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json if available
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Vite needs the public browser configuration at build time.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_KEY
RUN VITE_SUPABASE_URL="$VITE_SUPABASE_URL" VITE_SUPABASE_KEY="$VITE_SUPABASE_KEY" npm run build

# Stage 2: Production
FROM node:22-alpine AS runner

# Set NODE_ENV to production
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy the built output from the builder stage
# Nitro bundles everything needed for the server into .output
COPY --from=builder /app/.output ./.output

# Expose the port the app runs on (Nitro defaults to 3000)
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# Start the Node.js server
CMD ["node", ".output/server/index.mjs"]
