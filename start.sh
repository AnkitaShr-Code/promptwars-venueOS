#!/bin/bash
set -e

# Start redis natively in the background
echo "Starting internal Redis server setup..."
redis-server --daemonize yes

# Wait gracefully to ensure socket is bound
sleep 2

# Execute the primary application layer
echo "Bootstrapping VenueOS System via TSX..."
npm run start:prod
