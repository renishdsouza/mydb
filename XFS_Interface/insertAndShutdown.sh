#!/bin/bash

# Exit if any command fails
set -e

# Run xfsinterface and feed commands automatically
./xfs-interface <<EOF
fdisk
CREATE TABLE Numbers(key NUM);
OPEN TABLE Numbers;
INSERT INTO Numbers VALUES FROM numbers.csv;
EOF

# Wait to ensure insert operation completes (adjust if needed)
sleep 2000

echo "Inserted successfully!"

# Shutdown the system (will ask for sudo password)
sudo shutdown now

