#!/bin/bash
# Start backend server
(cd backend && node server.js &)
# Start frontend live-server
(npx live-server --port=8080 frontend &)
# Wait for processes
wait