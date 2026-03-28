const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const rootDir = __dirname;
const envName = String(process.env.NODE_ENV || "development").trim();

loadEnvFile(path.join(rootDir, ".env"));
if (envName) {
  loadEnvFile(path.join(rootDir, `.env.${envName}`));
}
loadEnvFile(path.join(rootDir, ".env.local"));
if (envName) {
  loadEnvFile(path.join(rootDir, `.env.${envName}.local`));
}
