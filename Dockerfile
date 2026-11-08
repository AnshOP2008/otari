# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json if available
COPY package*.json ./

# Install dependencies
RUN npm ci || npm install

# Copy the rest of the application code
COPY . .

# Build the TanStack Start (Nitro) application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner

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

# Start the Node.js server
CMD ["node", ".output/server/index.mjs"]
