// Test script for Gemini API
const https = require('https');

const apiKey = 'AIzaSyB-jz-oThJT-nRTKXa3yIqjqFSZGubt0is';
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

const data = JSON.stringify({
  contents: [{
    parts: [{ text: "Explain how AI works" }]
  }]
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(url, options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsedData = JSON.parse(responseData);
      console.log('Status Code:', res.statusCode);
      
      if (res.statusCode === 200 && parsedData.candidates && parsedData.candidates[0]?.content?.parts[0]?.text) {
        console.log('API TEST SUCCESSFUL!');
        console.log('Response:');
        console.log(parsedData.candidates[0].content.parts[0].text);
      } else if (parsedData.error) {
        console.log('API ERROR:');
        console.log(JSON.stringify(parsedData.error, null, 2));
      } else {
        console.log('UNEXPECTED RESPONSE FORMAT:');
        console.log(JSON.stringify(parsedData, null, 2));
      }
    } catch (error) {
      console.error('Error parsing response:', error);
      console.log('Raw response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(data);
req.end();

console.log('Testing Gemini API...');
