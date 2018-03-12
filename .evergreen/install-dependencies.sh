#!/bin/sh
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

NODE_LTS_NAME=${NODE_LTS_NAME:-carbon}
NODE_ARTIFACTS_PATH="${HOME}/src/node"
NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
NPM_CACHE_DIR="${NODE_ARTIFACTS_PATH}/npm"

# create node artifacts path if needed
mkdir -p ${NODE_ARTIFACTS_PATH}

# install Node.js
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.8/install.sh | bash
[ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"
nvm install --lts=${NODE_LTS_NAME}

# setup npm cache in a local directory
npm config set cache "${NPM_CACHE_DIR}"

# install node dependencies
npm install
