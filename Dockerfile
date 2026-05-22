FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application files
COPY . .

# Create volume for persistent exports
VOLUME ["/app/exports"]

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "run", "dev"]
