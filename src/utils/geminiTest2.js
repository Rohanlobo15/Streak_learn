// Test file for Gemini API with gemini-2.0-flash model
const apiKey = 'AIzaSyB-jz-oThJT-nRTKXa3yIqjqFSZGubt0is';

async function testGeminiAPI() {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Explain how AI works"
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    console.log('API Response:', data);
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      console.log('Success! API is working. Response text:', data.candidates[0].content.parts[0].text);
      return true;
    } else if (data.error) {
      console.error('API Error:', data.error);
      return false;
    } else {
      console.error('API returned unexpected format:', data);
      return false;
    }
  } catch (error) {
    console.error('Error testing Gemini API:', error);
    return false;
  }
}

testGeminiAPI().then(isWorking => {
  console.log('API working:', isWorking);
});
