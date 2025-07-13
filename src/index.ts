import express from "express";

const morgan = require("morgan");

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.send("Clothing Ecommerce");
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
