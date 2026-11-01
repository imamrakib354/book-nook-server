import express from 'express'
import 'dotenv/config'
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

const app  = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

app.get('/', (req,res) => {
    res.send({message: 'Server is running fine!'})
})


if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
}