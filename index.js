
import express from "express";
import "dotenv/config";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = Number(process.env.PORT || 8000);

app.use(cors());
app.use(express.json());

// JWT Middleware
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized!" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Token missing!" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.CLIENT_URL,
      audience: process.env.CLIENT_URL,
    });

    if (!payload.sub || !payload.email) {
      return res.status(401).send({ message: "Invalid user!" });
    }

    req.user = {
      id: payload.sub,
      name: payload.name || "",
      email: payload.email,
    };

    next();
  } catch (error) {
    console.error(error);
    return res.status(401).send({ message: "Invalid token!" });
  }
};

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  await client.connect();
  console.log("You successfully connected to MongoDB!");
  return client;
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("BookNookDB");

const booksCollection = db.collection("BooksCollection");
const borrowedBooksCollection = db.collection("BorrowedBooks");

// 1. GET /books - Public books, category, or my books
app.get(
  "/books",
  (req, res, next) => {
    if (req.query.mine === "true") {
      return verifyToken(req, res, next);
    }
    next();
  },
  async (req, res) => {
    const filter = {};

    if (req.query.mine === "true") {
      filter.ownerEmail = req.user.email;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const result = await booksCollection.find(filter).toArray();
    res.send(result);
  }
);

// 2. GET /books/:id - Get single book
app.get("/books/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await booksCollection.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});

// 3. POST /books - Add book

app.post("/books", verifyToken, async (req, res) => {
  const data = req.body;

  data.copies = Number(data.copies);
  data.borrowDays = Number(data.borrowDays);

  const result = await booksCollection.insertOne({
    ...data,
    ownerId: req.user.id,
    ownerName: req.user.name,
    ownerEmail: req.user.email,
    borrowCount: 0,
    createdAt: new Date(),
  });

  res.send(result);
});

// 4. PATCH /books/:id - Update own book
app.patch("/books/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const data = {};

  const fields = [
    "title",
    "author",
    "category",
    "coverUrl",
    "description",
    "copies",
    "borrowDays",
  ];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      data[field] = req.body[field];
    }
  }

  if (data.copies !== undefined) {
    data.copies = Number(data.copies);
  }

  if (data.borrowDays !== undefined) {
    data.borrowDays = Number(data.borrowDays);
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).send({ message: "No fields to update" });
  }

  const result = await booksCollection.updateOne(
    {
      _id: new ObjectId(id),
      ownerEmail: req.user.email,
    },
    { $set: data }
  );

  res.send(result);
});

// 5. DELETE /books/:id - Delete own book
app.delete("/books/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await booksCollection.deleteOne({
    _id: new ObjectId(id),
    ownerEmail: req.user.email,
  });

  res.send(result);
});

// 6. POST /borrows - Borrow book
app.post("/borrows", verifyToken, async (req, res) => {
  const { bookId } = req.body;

  const book = await booksCollection.findOne({
    _id: new ObjectId(bookId),
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
    name: req.user.name,
    email: req.user.email,
    borrowDate,
    dueDate,
  });

  res.send(result);
});

// 7. GET /borrows - Get logged-in user's borrows
app.get("/borrows", verifyToken, async (req, res) => {
  const result = await borrowedBooksCollection
    .find({ email: req.user.email })
    .toArray();

  res.send(result);
});

// 8. DELETE /borrows/:id - Return borrowed book
app.delete("/borrows/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const borrowed = await borrowedBooksCollection.findOne({
    _id: new ObjectId(id),
    email: req.user.email,
  });

  if (!borrowed) {
    return res.status(404).send({ message: "Borrow not found" });
  }

  const result = await borrowedBooksCollection.deleteOne({
    _id: borrowed._id,
    email: req.user.email,
  });

  if (result.deletedCount > 0) {
    await booksCollection.updateOne(
      { _id: borrowed.bookId },
      { $inc: { copies: 1 } }
    );
  }

  res.send(result);
});

// Start Server
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

export default app;
