import crypto from "crypto";
import fs from "fs";

const MAX_HASH_BYTES = Number(process.env.HASH_MAX_BYTES || 0);

export async function hashFile(filePath, sizeBytes = 0) {
  if (MAX_HASH_BYTES > 0 && sizeBytes > MAX_HASH_BYTES) {
    return null;
  }

  return new Promise((resolve) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", () => resolve(null));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
