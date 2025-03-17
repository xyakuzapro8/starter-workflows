const axios = require('axios');

// Example of making a GET request using axios
axios.get('https://example.com/api/data')
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error(error);
  });