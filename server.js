const express = require("express");
const os = require("os");
const path = require("path");

const app = express();
const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const projectRoot = __dirname;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
});

app.use("/css", express.static(path.join(projectRoot, "css")));
app.use("/js", express.static(path.join(projectRoot, "js")));

for (const asset of ["favicon.svg", "manifest.json", "sw.js"]) {
  app.get(`/${asset}`, (req, res) => {
    res.sendFile(path.join(projectRoot, asset));
  });
}

app.listen(port, host, () => {
  console.log(`My Terminal listening on port ${port}.`);
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        console.log(`Mobile/LAN: http://${address.address}:${port}`);
      }
    }
  }
});
