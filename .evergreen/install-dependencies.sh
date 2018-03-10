#!/bin/sh
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# script args
NODE_LTS_NAME=${NODE_LTS_NAME:-carbon}
MONGODB_VERSION=${MONGODB_VERSION:-latest}
DIR=$(dirname $0)

# install MongoDB
# Functions to fetch MongoDB binaries
. ${DRIVERS_TOOLS}/.evergreen/download-mongodb.sh

get_distro
if [ -z "$MONGODB_DOWNLOAD_URL" ]; then
    get_mongodb_download_url_for "$DISTRO" "$MONGODB_VERSION"
fi
# Even though we have the MONGODB_DOWNLOAD_URL, we still call this to get the proper EXTRACT variable
get_mongodb_download_url_for "$DISTRO"
download_and_extract "$MONGODB_DOWNLOAD_URL" "$EXTRACT"

# install Node.js
export NVM_DIR="$HOME/src/.nvm"
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.8/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts=${NODE_LTS_NAME}

# install node dependencies
npm install
