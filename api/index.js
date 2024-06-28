import express from "express";
import data from "./data.js";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
const app = express();
import cors from "cors";
app.use(
  cors({
    origin: "http://localhost:3000", // Specify the origin you want to allow
    methods: ["GET", "POST"], // Specify allowed methods
    allowedHeaders: ["Content-Type"], // Specify allowed headers
  })
);
app.use(express.json({limit: '2mb'}));

const OPTIMISED_SIZE = 28;
const THRESHOLD = 0.1;
const FILTER_LIMIT = 0.15;
const SLICE_LIMIT = 10;

app.post("/getFilteredIconsFromSVG", handleSVG);
app.post("/getFilteredIconsFromPNG", handlePNG);

(async () => {
  app.listen(3001, () => console.log("Server ready on port 3001."));
})();
export default app;

async function handleSVG(req, res) {
  const { userInput } = req.body;
  try {
    let t1 = Date.now();
    const baseSVGPath = Buffer.from(userInput);
    const baseSVGData = await convertSVGToData(baseSVGPath);
    let sortedRes = await filterIcons(baseSVGData);
    let t2 = Date.now();
    res.status(200).json({ sortedRes: sortedRes, time: t2 - t1 });
  } catch (error) {
    console.error(`Error with API call: `, error);
    res.status(500).json({
      message: "An error occurred while processing your request.",
      error: error.message,
    });
  }
}

async function convertSVGToData(svgPath) {
  try {
    const { data } = await sharp(svgPath)
      .resize(OPTIMISED_SIZE, OPTIMISED_SIZE)
      .raw()
      .toBuffer({ resolveWithObject: true });

    return data;
  } catch (error) {
    console.error(`Error converting ${svgPath} to raw object:`, error);
  }
}

async function filterIcons(baseData) {
  const promises = data.map(async (image) => {
    const imageSVGPath = image.nodepath;
    const imageSVGData = await convertSVGToData(imageSVGPath);

    const totalPixels = OPTIMISED_SIZE * OPTIMISED_SIZE;
    const differentPixels = pixelmatch(
      baseData,
      imageSVGData,
      null,
      OPTIMISED_SIZE,
      OPTIMISED_SIZE,
      {
        threshold: THRESHOLD,
        includeAA: false,
      }
    );
    const mismatchRatio = differentPixels / totalPixels;
    return {
      id: image.id,
      mismatch: mismatchRatio,
      exactMatch: mismatchRatio === 0,
    };
  });

  const res = await Promise.all(promises);
  const sortedRes = res
    .filter((image) => image.mismatch < FILTER_LIMIT)
    .sort((a, b) => a.mismatch - b.mismatch)
    .slice(0, SLICE_LIMIT);
  return sortedRes;
}

async function handlePNG(req, res) {
  const { userInput } = req.body;
  try {
    let t1 = Date.now();
    const PNGBuffer = getBufferFromPNG(userInput);
    const PNGData = await convertSVGToData(PNGBuffer);
    let sortedRes = await filterIcons(PNGData);
    let t2 = Date.now();
    res.status(200).json({ sortedRes: sortedRes, time: t2 - t1 });
  } catch (error) {
    console.error(`Error with API call: `, error);
    res.status(500).json({
      message: "An error occurred while processing your request.",
      error: error.message,
    });
  }
}

function getBufferFromPNG(file) {
  const base64Data = file.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64Data, "base64");
}
