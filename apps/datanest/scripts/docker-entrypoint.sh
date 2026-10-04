#!/bin/sh
set -eu

node /app/write-runtime-config.mjs /app/public/runtime-config.js
exec node /app/server.js
