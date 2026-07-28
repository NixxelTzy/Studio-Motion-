const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { bundle } = require("@remotion/bundler");
const { renderMedia } = require("@remotion/renderer");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // Menyajikan frontend statis

// API Endpoint untuk merender video
app.post("/api/render", async (req, res) => {
  let outputLocation = "";

  try {
    const { code, params } = req.body;
    if (!code || !params) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const fps = 30;
    const durationInFrames = Math.max(150, params.duration * fps); // Min 5 detik

    const resolutions = {
      "1080": { w: 1920, h: 1080 },
      "1440": { w: 2560, h: 1440 },
      "2160": { w: 3840, h: 2160 },
    };
    const resObj = resolutions[params.resolution] || resolutions["1080"];

    console.log(`[Node.js Engine] Start rendering: ${params.duration}s at ${resObj.w}x${resObj.h}`);

    // 1. Bundle Remotion (kompilasi React ke Webpack)
    const entryPoint = path.resolve(__dirname, "remotion/index.ts");
    const bundleLocation = await bundle({ entryPoint });
    console.log(`[Node.js Engine] Bundled at: ${bundleLocation}`);

    // 2. Tentukan lokasi file MP4 sementara
    const uniqueId = `render_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    outputLocation = path.join(os.tmpdir(), `${uniqueId}.mp4`);

    // 3. Render MP4 menggunakan FFmpeg
    await renderMedia({
      composition: {
        id: "MainVideo",
        durationInFrames,
        fps,
        width: resObj.w,
        height: resObj.h,
      },
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation,
      inputProps: {
        userCode: code,
        theme: params.theme,
        visualStyle: params.visualStyle,
        scenes: params.scenes,
      },
      imageFormat: "jpeg",
      onProgress: ({ progress }) => {
        console.log(`[Node.js Engine] Progress: ${(progress * 100).toFixed(1)}%`);
      }
    });

    console.log(`[Node.js Engine] Render Complete. Reading buffer...`);

    // 4. Baca file MP4 dan kirim ke client
    const videoBuffer = fs.readFileSync(outputLocation);
    
    // 5. Cleanup file sementara
    fs.unlinkSync(outputLocation);
    outputLocation = ""; 

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="RenderCraft_${params.theme}.mp4"`);
    res.send(videoBuffer);

  } catch (error) {
    console.error("[Node.js Engine] Error:", error);
    if (outputLocation && fs.existsSync(outputLocation)) {
      try { fs.unlinkSync(outputLocation); } catch (e) {}
    }
    res.status(500).json({ error: "Render Engine Failed", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`👉 Buka link di atas melalui browser Anda.\n`);
});
