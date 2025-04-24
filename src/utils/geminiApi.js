// Gemini API utility functions
const API_KEY = 'AIzaSyB-jz-oThJT-nRTKXa3yIqjqFSZGubt0is';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Generate a summary using Gemini API
 * @param {string} topic - The study topic
 * @param {number} hours - Hours studied
 * @param {string} fileContent - Optional file content to analyze
 * @returns {Promise<string>} The generated summary
 */
export async function generateSummary(topic, hours, fileContent = null) {
  try {
    // Create a well-structured prompt for better summaries
    let prompt = `Task: Generate a concise, educational summary about a study session.

Topic: "${topic}"
Duration: ${hours} hour${hours !== 1 ? 's' : ''}

Requirements:
- Create a focused summary of what was likely learned
- Highlight key concepts and potential progress made
- Keep it under 100 words
- Make it educational and motivational
- Use clear, concise language`;
    
    if (fileContent) {
      prompt += `

Study Material Content:
${fileContent}

Additional Instructions:
- Extract and summarize the most important concepts from the provided content
- Focus on the main ideas and learning outcomes`;
    }
    
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4, // Lower temperature for more focused summaries
          maxOutputTokens: 250,
          topK: 40,
          topP: 0.95
        }
      })
    });

    // Handle the response
    const data = await response.json();
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      const summary = data.candidates[0].content.parts[0].text.trim();
      
      // Post-process the summary to ensure it's clean and well-formatted
      return summary
        .replace(/^Summary:/, '') // Remove any "Summary:" prefix the AI might add
        .replace(/^\s*\n+/, '') // Remove leading empty lines
        .trim();
    } else if (data.error) {
      console.error('Gemini API error:', data.error);
      return `Could not generate summary: ${data.error.message || 'Unknown error'}`;
    } else {
      console.error('Unexpected Gemini API response format:', data);
      return 'Could not generate summary due to an unexpected API response.';
    }
  } catch (error) {
    console.error('Error generating summary with Gemini API:', error);
    return 'Could not generate summary due to an error.';
  }
}

/**
 * Extract text content from a file
 * @param {File} file - The file object
 * @returns {Promise<string|null>} The extracted text content or null if extraction failed
 */
export async function extractFileContent(file) {
  // Only process text-based files
  const textBasedTypes = [
    'text/plain', // .txt
    'application/pdf', // .pdf
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'text/csv', // .csv
    'text/javascript', // .js
    'text/html', // .html
    'text/css', // .css
    'application/json', // .json
    'text/x-python', // .py
    'text/x-c++src', // .cpp
    'text/x-csrc', // .c
    'text/x-java', // .java
    'application/xml', // .xml
    'text/markdown', // .md
  ];
  
  // Check if file type is supported by MIME type or extension
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const textExtensions = ['txt', 'py', 'cpp', 'c', 'java', 'js', 'html', 'css', 'json', 'xml', 'md', 'csv'];
  
  const isTextBased = 
    textBasedTypes.some(type => file.type.includes(type)) || 
    textExtensions.includes(fileExtension);
  
  if (!isTextBased) {
    console.log('File type not supported for text extraction:', file.type, fileExtension);
    return null;
  }
  
  try {
    // For PDF files, we would need a PDF.js library, but for simplicity,
    // we'll just handle text files directly
    if (file.type === 'application/pdf') {
      return "PDF content extraction requires additional libraries. Summary will be based on topic only.";
    }
    
    // For Word documents, we would need specific libraries
    if (file.type.includes('word')) {
      return "Word document content extraction requires additional libraries. Summary will be based on topic only.";
    }
    
    // For text-based files
    return await file.text();
  } catch (error) {
    console.error('Error extracting file content:', error);
    return null;
  }
}

/**
 * Truncate text to a maximum length to avoid API limits
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length (default: 5000 characters)
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 5000) {
  if (!text || text.length <= maxLength) return text;
  
  return text.substring(0, maxLength) + '... [Content truncated due to length]';
}
