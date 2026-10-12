// Mechanical optimization of existing LIQ EVENT photos; no generated imagery.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.join(__dirname, '..');
  const destination = path.join(root, 'assets/img/conferences');
  fs.mkdirSync(destination, { recursive: true });
  const jobs = [
    ['case_annual_awards.jpg', 'annual-awards', [480, 960, 1280]],
    ['case_annual_program.jpg', 'annual-program', [960]],
    ['case_2024_stage.webp', 'education-stage', [960]]
  ];
  for (const [source, name, sizes] of jobs) {
    for (const width of sizes) {
      const file = path.join(destination, `${name}-${width}.webp`);
      await sharp(path.join(root, 'assets/img', source)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(file);
      const info = await sharp(file).metadata();
      console.log(`${path.relative(root, file)}: ${info.width}x${info.height}, ${fs.statSync(file).size} bytes`);
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
