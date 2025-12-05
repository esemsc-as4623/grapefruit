#!/bin/bash

# Generate self-signed SSL certificate for development
# For production, use Let's Encrypt or proper CA-signed certificates

echo "🔐 Generating self-signed SSL certificate for development..."

# Create ssl directory if it doesn't exist
mkdir -p ssl

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 -keyout ssl/server.key -out ssl/server.cert -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Grapefruit/CN=localhost"

if [ $? -eq 0 ]; then
  echo "✅ SSL certificate generated successfully!"
  echo ""
  echo "Files created:"
  echo "  - ssl/server.key (private key)"
  echo "  - ssl/server.cert (certificate)"
  echo ""
  echo "Add to .env:"
  echo "  ENABLE_HTTPS=true"
  echo "  SSL_KEY_PATH=./ssl/server.key"
  echo "  SSL_CERT_PATH=./ssl/server.cert"
  echo ""
  echo "⚠️  NOTE: This is a self-signed certificate for development only!"
  echo "⚠️  For production, use Let's Encrypt or a proper CA-signed certificate."
else
  echo "❌ Failed to generate SSL certificate"
  exit 1
fi
