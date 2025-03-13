const { MongoClient } = require('mongodb');

async function runMongoQuery(uri, dbName, queryFunction) {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Execute the function with the correct db object
        const result = await queryFunction(db);
        
        console.log("Query Result:", result);
        return result;
    } catch (error) {
        console.error("Error executing query:", error);
    } finally {
        await client.close();
    }
}

// MongoDB Connection Details
const mongoUri = "mongodb+srv://mayankvashishtt:Mayank2005@cluster0.nd2dv1y.mongodb.net/";
const databaseName = "auth";

// ✅ Pass a function instead of a string
const queryFunction = async (db) => db.collection('skus').countDocuments();

// Run the query
runMongoQuery(mongoUri, databaseName, queryFunction)
    .then(() => console.log("Query Execution Completed"))
    .catch(err => console.error("Execution Error:", err));
