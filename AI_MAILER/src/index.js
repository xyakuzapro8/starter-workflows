const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const tough = require('tough-cookie');

// Example of using axios with cookie jar support
const cookieJar = new tough.CookieJar();
const client = wrapper(axios.create({ jar: cookieJar }));

client.get('https://example.com')
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error(error);
  });