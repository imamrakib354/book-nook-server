import express from 'express'
import 'dotenv/config'
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = Number(process.env.PORT || 8000)

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
const borrowedBooksCollection = db.collection("BorrowedBooks");

app.get('/', (req, res) => {
  res.send({ message: 'Server is running fine!' })
})

app.post("/add-book", async (req, res) => {
  const data = req.body;

  data.copies = Number(data.copies);
  data.borrowDays = Number(data.borrowDays);

  const result = await booksCollection.insertOne({
    ...data,
    borrowCount: 0
  });
  res.send(result);
});

app.get("/all-books", async (req, res) => {
  const result = await booksCollection.find().toArray();
  res.send(result);
});

app.get("/all-books/:id", async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.findOne({
    _id: new ObjectId(id),
  });
  res.send(result);
});


app.get("/all-books/category/:category", async (req, res) => {
  const { category } = req.params;

  const result = await booksCollection
    .find({ category: category })
    .toArray();

  res.send(result);
});


app.get("/my-books", async (req, res) => {
  const { email } = req.query;

  if (typeof email !== "string" || !email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const result = await booksCollection
    .find({ ownerEmail: email })
    .toArray();

  res.send(result);
});

app.patch("/all-books/:id", async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  if (data.copies !== undefined) {
    data.copies = Number(data.copies);
  }

  if (data.borrowDays !== undefined) {
    data.borrowDays = Number(data.borrowDays);
  }

  const result = await booksCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: data }
  );

  res.json(result);
});

app.delete("/all-books/:id", async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.deleteOne({
    _id: new ObjectId(id)
  });
  res.json(result);
});

app.post("/my-borrows", async (req, res) => {
  const { bookId, name, email } = req.body;

  const book = await booksCollection.findOne({
    _id: new ObjectId(bookId)
  });

  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }

  const updated = await booksCollection.updateOne(
    { _id: book._id, copies: { $gt: 0 } },
    { $inc: { copies: -1, borrowCount: 1 } }
  );

  if (updated.modifiedCount === 0) {
    return res.status(400).send({ message: "No copies available" });
  }

  const borrowDate = new Date();
  const dueDate = new Date(
    borrowDate.getTime() + Number(book.borrowDays) * 86400000
  );

  const result = await borrowedBooksCollection.insertOne({
    bookId: book._id,
    title: book.title,
    coverUrl: book.coverUrl,
    name,
    email,
    borrowDate,
    dueDate
  });

  res.send(result);
});

app.get("/my-borrows/:email", async (req, res) => {
  const { email } = req.params;
  const result = await borrowedBooksCollection.find({ email: email }).toArray();
  res.send(result);
});

app.delete("/my-borrows/:id", async (req, res) => {
  const { id } = req.params;

  const borrowed = await borrowedBooksCollection.findOne({
    _id: new ObjectId(id)
  });

  if (!borrowed) {
    return res.status(404).send({ message: "Borrow not found" });
  }

  const result = await borrowedBooksCollection.deleteOne({
    _id: new ObjectId(id)
  });

  if (result.deletedCount > 0) {
    await booksCollection.updateOne(
      { _id: new ObjectId(borrowed.bookId) },
      { $inc: { copies: 1 } }
    );
  }

  res.send(result);
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

export default app;

