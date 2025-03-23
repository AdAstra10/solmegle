#!/bin/bash

# This extra step ensures bcrypt is rebuilt for this environment
cd server
npm rebuild bcrypt --build-from-source
cd ..

# Start the application
cd server
node dist/index.js 