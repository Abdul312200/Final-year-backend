import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/gold-price", async (req, res) => {
  try {
    const response = await axios.get("https://www.goldapi.io/api/XAU/INR", {
      headers: {
        "x-access-token": "S9CK2RMC9A1SGTZ5"
      }
    });

    res.json({
      price: response.data.price,
      change: response.data.ch,
      change_percent: response.data.chp
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch gold price" });
  }
});

export default router;
