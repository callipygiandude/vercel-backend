import express from "express";
import data from "./data.js";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
const app = express();
import cors from "cors";
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const OPTIMISED_SIZE = 28;
const THRESHOLD = 0.1;
const SVG_FILTER_LIMIT = 0.15;
const PNG_FILTER_LIMIT = 0.20;
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
    const baseSVGData = await convertImageToData(baseSVGPath);
    let sortedRes = await filterIcons(baseSVGData, SVG_FILTER_LIMIT);
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

async function convertImageToData(image) {
  try {
    const { data } = await sharp(image)
      .resize(OPTIMISED_SIZE, OPTIMISED_SIZE)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return data;
  } catch (error) {
    console.error(`Error converting ${image} to raw object:`, error);
  }
}

async function filterIcons(baseData, LIMIT) {
  const promises = data.map(async (image) => {
    const imageSVGPath = image.nodepath;
    const imageSVGData = await convertImageToData(imageSVGPath);
    
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
                    .filter((image) => image.mismatch < LIMIT)
                    .sort((a, b) => a.mismatch - b.mismatch)
                    .slice(0, SLICE_LIMIT);
  return sortedRes;
}

async function handlePNG(req, res) {
  const { userInput } = req.body;
  try {
    let t1 = Date.now();
    const PNGBuffer = getBufferFromPNG(userInput);
    // const PNGData = await convertImageToData(PNGBuffer);
    const PNGData = await processImage(PNGBuffer);
    let sortedRes = await filterIcons(PNGData, PNG_FILTER_LIMIT);
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

async function boundingBox(image) {
  const { data, info } = await sharp(image)
                                .greyscale()
                                .threshold(220)
                                .raw()
                                .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const bg = data[0];
  let x1 = width,
    y1 = height,
    x2 = 0,
    y2 = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * width + x;
      const value = data[offset];

      if (value !== bg) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }

  return [x1, y1, x2, y2];
}

async function processImage(image) {
  const bbox = await boundingBox(image);

  if (!bbox) {
    console.log("error");
    return;
  }

    let [x1, y1, x2, y2] = bbox;
    let width = x2 - x1;
    let height = y2 - y1;

    if (height < width) {
    const diff = width - height;
    y1 -= diff / 2;
    height = width;
    } else {
    const diff = height - width;
    x1 -= diff / 2;
    width = height;
    }

    if (x1 < 0) x1 = 0;
    if (y1 < 0) y1 = 0;

    if(x1 > x2 || y1 > y2) {
        return convertImageToData(image);
    }
  const extractedBuffer = await sharp(image)
    .extract({ left: x1, top: y1, width, height })
    .png()
    .toBuffer({ resolveWithObject: true });

  const { data } = await sharp(extractedBuffer.data)
    .resize(OPTIMISED_SIZE, OPTIMISED_SIZE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return data;
}
