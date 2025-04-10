const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Setup
const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
app.use(bodyParser.json());

// Load Physics context JSON
let physicsData;
try {
    const rawData = fs.readFileSync('physics_content.json', 'utf-8');
    physicsData = JSON.parse(rawData);
    console.log('Physics content loaded with', physicsData.chapters?.length || 0, 'chapters');
} catch (error) {
    console.error('Failed to load physics content:', error);
    physicsData = { chapters: [] };
}

// Load motion1D.json
let motion1DData;
try {
    const rawData1D = fs.readFileSync('motion1D.json', 'utf-8');
    motion1DData = JSON.parse(rawData1D);
    console.log('Motion1D content loaded with', motion1DData.chapters?.length || 0, 'chapters');
} catch (error) {
    console.error('Failed to load motion1D content:', error);
    motion1DData = { chapters: [] };
}

// Load motion2D.json
let motion2DData;
try {
    const rawData2D = fs.readFileSync('motion2D.json', 'utf-8');
    motion2DData = JSON.parse(rawData2D);
    console.log('Motion2D content loaded with', motion2DData.chapters?.length || 0, 'chapters');
} catch (error) {
    console.error('Failed to load motion2D content:', error);
    motion2DData = { chapters: [] };
}

// Merge all chapters for unified search
const allChapters = [
    ...(physicsData.chapters || []),
    ...(motion1DData.chapters || []),
    ...(motion2DData.chapters || [])
];
physicsData.chapters = allChapters;

// Initialize Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Connect to MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
async function connectMongoDB() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('physics_bot');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
}
connectMongoDB();

// Util: Find relevant topic
const findRelevantTopic = (question) => {
    try {
        const allTopics = physicsData.chapters.flatMap(ch => ch.topics || []);
        return allTopics.find(topic =>
            topic.context?.toLowerCase().includes(question.toLowerCase())
        ) || { name: 'Physics', prerequisites: '', context: 'General physics concepts.' };
    } catch {
        return { name: 'Physics', prerequisites: '', context: 'General physics concepts.' };
    }
};

// Util: Prepare context for Gemini
const prepareSystemContext = (history, topic) => `
You are a helpful Physics teacher. Provide **thorough and easy-to-follow** explanations.

# Topic: ${topic.name}
## Prerequisites: ${topic.prerequisites}

### Context:
${topic.context}

### Guidelines:
- Format using **Markdown**
- Use \`code blocks\` for formulas
- Include **real-life examples** and step-by-step details
- Focus on clarity to help students understand thoroughly
- Use **bold** and *italic* texts for emphasis
- Offer more insight than typical short responses

### Recent Chat:
${history.map(h => `Student: ${h.user}\nTeacher: ${h.ai}`).join('\n\n')}

Now respond clearly to the following question.
`;

// MongoDB helpers
const storeChatHistory = async (user, ai) => {
    try {
        await db.collection('chat_history').insertOne({ user, ai, timestamp: new Date() });
    } catch (err) {
        console.error('Error storing history:', err);
    }
};

const getChatHistory = async () => {
    try {
        return await db.collection('chat_history').find().sort({ timestamp: -1 }).limit(5).toArray();
    } catch {
        return [];
    }
};

// Route to handle question
app.post('/api/ask', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) throw new Error("Question is required.");

        const topic = findRelevantTopic(question);
        const history = await getChatHistory();
        const fullPrompt = `${prepareSystemContext(history, topic)}\nStudent: ${question}\nTeacher:`;

        const result = await model.generateContent(fullPrompt);
        const response = result.response.text();

        await storeChatHistory(question, response);

        res.json({
            success: true,
            response,
            topic: topic.name,
            message: "Response generated successfully."
        });
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Start server
const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await mongoClient.close();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});