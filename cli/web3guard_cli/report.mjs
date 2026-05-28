import { readFile, writeFile } from "node:fs/promises";
import { buildSarif } from "./sarif.mjs";

export async function convertReport(inputPath, format, outputPath) {
  const raw = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw);
  if (format !== "sarif") {
    const error = new Error(`Unsupported report format: ${format}`);
    error.code = "UNSUPPORTED_FORMAT";
    throw error;
  }
  const sarif = buildSarif(parsed);
  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(sarif, null, 2)}\n`, "utf8");
  }
  return sarif;
}
