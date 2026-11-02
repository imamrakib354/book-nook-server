import express from 'express'
import 'dotenv/config'
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

const app  = express();
const port =Number(process.env.PORT || 8000)

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("BookNookDB");
const booksCollection = db.collection("BooksCollection");

app.get('/', (req,res) => {
    res.send({message: 'Server is running fine!'})
})

app.post("/add-book", async (req, res) => {
  const data = req.body;
  const result = await booksCollection.insertOne(data);
  res.send(result);
});

app.get("/all-books", async (req, res) => {
  const result = await booksCollection.find().toArray();
  res.send(result);
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

