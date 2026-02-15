FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy server code
COPY index.js ./

# Run the server
CMD ["node", "index.js"]
