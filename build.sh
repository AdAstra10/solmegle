#!/bin/bash

# Install dependencies
npm install

# Build client and server (this will be done via the postinstall script)
# Deploy static assets
mkdir -p server/public
cp -r client/build/* server/public/ 