
// Description:
//   Connect to colonyServer for auth token
//

const fetch = require('node-fetch')

const postRequest = async (path, data) => {
  const URL = process.env.SERVER_ENDPOINT
  const response = await fetch(`${URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return response.json()
}

const getChallenge = async (wallet) => {
  return await postRequest('/auth/challenge', {
    address: wallet.address.toLowerCase(),
  });
}

const getToken = async (challenge, signature) => {
  return await postRequest('/auth/token', {
    challenge,
    signature,
  });
}

module.exports = {
  getChallenge,
  getToken,
};
