const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(bodyParser.json());

// Load Physics context from JSON with error handling
let physicsData;
try {
    const rawData = fs.readFileSync('physics_content.json', 'utf-8');
    physicsData = JSON.parse(rawData);
    console.log('Physics content loaded successfully');
} catch (error) {
    console.error('Error loading physics content:', error);
    physicsData = { chapters: [] };
}

// Ollama API setup
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';

// Helper functions
const findRelevantTopic = (question) => {
    try {
        if (!physicsData || !physicsData.chapters || !physicsData.chapters[0].topics) {
            throw new Error('Invalid physics content structure');
        }

        // Get all topics from all chapters
        const allTopics = physicsData.chapters.flatMap(chapter => chapter.topics);
        
        // Find topic with content
        const relevantTopic = allTopics.find(topic => topic.context && topic.context.length > 0);
        
        if (!relevantTopic) {
            throw new Error('No suitable topic found');
        }

        return {
            name: relevantTopic.name || 'Physics Topic',
            prerequisites: relevantTopic.prerequisites || 'Basic knowledge',
            context: relevantTopic.context
        };
    } catch (error) {
        console.error('Error finding relevant topic:', error);
        return {
            name: 'Physics',
            prerequisites: 'Basic physics knowledge',
            context: 'General physics concepts and principles'
        };
    }
};

const getChatHistory = async () => {
    return []; // Implement MongoDB chat history retrieval here
};

const storeChatHistory = async (question, response) => {
    console.log('Storing chat history:', { question, response });
    // Implement MongoDB storage here
};

// Prepare AI prompt with structured teaching explanation and Markdown support
const prepareSystemContext = (chatHistory, topic) => `
You are a Physics teacher helping students understand concepts with clear and detailed explanations. 

# Current Topic: ${topic.name}
## Prerequisites: ${topic.prerequisites}

### Context Information:
${topic.context}

### Guidelines:
- Format your responses using Markdown for better readability
- Use \`code blocks\` for mathematical equations and formulas
- Create numbered lists for step-by-step explanations
- Use bullet points for key concepts
- Include examples with real-world applications
- Break down complex calculations step by step
- Use bold and italic text for emphasis
- Create tables when comparing concepts

### Previous Discussion:
${chatHistory.map(h => `**Student**: ${h.user}\n**Teacher**: ${h.ai}`).join('\n\n')}

Please provide a clear and detailed explanation using proper Markdown formatting.
`;

// Function to call Ollama API with enhanced error handling
// Update the generateOllamaResponse function to clean the response

async function generateOllamaResponse(prompt) {
    try {
        const response = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'deepseek-r1:7b',
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data.response) {
            throw new Error('Invalid response from Ollama API');
        }

        // Clean the response by removing <think> tags and their content
        let cleanedResponse = data.response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        
        // Remove any extra whitespace that might have been left
        cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');

        return cleanedResponse;
    } catch (error) {
        console.error('Error calling Ollama API:', error);
        throw new Error(`Failed to generate response: ${error.message}`);
    }
}

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/ask', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ 
                success: false, 
                message: 'Question is required' 
            });
        }

        console.log('Received question:', question);

        const relevantTopic = findRelevantTopic(question);
        const chatHistory = await getChatHistory();
        const fullPrompt = `${prepareSystemContext(chatHistory, relevantTopic)}\nStudent: ${question}\nTeacher:`;

        console.log('Generating response...');
        const response = await generateOllamaResponse(fullPrompt);

        await storeChatHistory(question, response);
        res.json({ 
            success: true, 
            response, 
            message: 'Answer generated successfully',
            topic: relevantTopic.name
        });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message, 
            message: 'Failed to generate response'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: err.message
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Ollama API URL:', OLLAMA_API_URL);
    console.log('Physics content loaded with', 
        physicsData.chapters?.length || 0, 'chapters');
});