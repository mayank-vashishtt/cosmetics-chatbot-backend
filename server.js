const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

async function connectMongoDB() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('chat_history');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
}
connectMongoDB();

// Skincare products list with detailed descriptions and links
const PRODUCTS = [
    { 
        name: "Hydrating Moisturizer", 
        type: "moisturizer", 
        skinType: "dry", 
        benefits: "Provides deep hydration, prevents flakiness, and keeps skin smooth.",
        link: "<REAL_PURCHASE_LINK>"
    },
    { 
        name: "Oil-Free Gel Moisturizer", 
        type: "moisturizer", 
        skinType: "oily", 
        benefits: "Lightweight, controls oil production, and is non-comedogenic.",
        link: "<REAL_PURCHASE_LINK>"
    },
    { 
        name: "Acne Control Face Wash", 
        type: "face wash", 
        skinType: "oily, acne-prone", 
        benefits: "Reduces pimples, unclogs pores, and contains salicylic acid to fight acne.",
        link: "<REAL_PURCHASE_LINK>"
    },
    { 
        name: "Brightening Vitamin C Serum", 
        type: "serum", 
        skinType: "all", 
        benefits: "Boosts glow, reduces dark spots, and evens out skin tone.",
        link: "<REAL_PURCHASE_LINK>"
    },
    { 
        name: "Sunscreen SPF 50", 
        type: "sunscreen", 
        skinType: "all", 
        benefits: "Protects against UVA/UVB rays, is non-greasy, and ideal for daily use.",
        link: "<REAL_PURCHASE_LINK>"
    },
    { 
        name: "Aloe Vera Soothing Gel", 
        type: "gel", 
        skinType: "sensitive", 
        benefits: "Calms redness, hydrates, and helps in healing irritated skin.",
        link: "<REAL_PURCHASE_LINK>"
    },
    { 
        name: "Retinol Night Cream", 
        type: "cream",     
        skinType: "mature, acne-prone", 
        benefits: "Anti-aging, reduces fine lines, and improves skin texture.",
        link: "<REAL_PURCHASE_LINK>"
    }
];

const prepareSystemContext = (chatHistory) => `
You are a skincare recommendation assistant. Based on the user's query, suggest the best cosmetic product for their skin type.

Here are some skincare products available:
${PRODUCTS.map(p => `- ${p.name} (${p.type}) for ${p.skinType} skin: ${p.benefits} [Buy here](${p.link})`).join('\n')}

Guidelines:
- Recommend a product that matches the user's skin type or concern.
- Keep the response concise and only suggest relevant products.
- If a user asks about pimples, recommend products for acne-prone skin.
- If a user asks about hydration, recommend moisturizers or hydrating products.
- give the link present with the product name so that user can buy it from there. 

Chat history:
${chatHistory.map(h => `User: ${h.user}\nAI: ${h.ai}`).join('\n')}

Use the chat history to provide relevant answers.
`;

async function storeChatHistory(user, ai) {
    try {
        await db.collection('history').insertOne({ user, ai, timestamp: new Date() });
    } catch (err) {
        console.error("Error storing chat history:", err);
    }
}

async function getChatHistory() {
    try {
        return await db.collection('history').find().sort({ timestamp: -1 }).limit(5).toArray();
    } catch (err) {
        console.error("Error fetching chat history:", err);
        return [];
    }
}

app.post('/api/addtext', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');

        const chatHistory = await getChatHistory();
        const fullPrompt = `${prepareSystemContext(chatHistory)}\nUser: ${prompt}\nAI:`;

        const result = await model.generateContent(fullPrompt);
        const response = result.response?.text?.() || "No response generated.";

        await storeChatHistory(prompt, response);

        console.log(response);
        
        res.json({ success: true, response, message: 'Response generated successfully' });
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ success: false, error: error.message, message: 'Failed to generate response' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    await mongoClient.close();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});
