const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, 'public', 'images', 'books', 'Judul buku Cakranexa.pdf');
const outPath = path.join(__dirname, 'pdf_extract_output.txt');

console.log('PDF Path:', pdfPath);
console.log('PDF exists:', fs.existsSync(pdfPath));

if (!fs.existsSync(pdfPath)) {
  console.error('ERROR: PDF tidak ditemukan di', pdfPath);
  process.exit(1);
}

async function main() {
  try {
    const { default: pdf } = await import('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfPath);
    const d = await pdf(dataBuffer);
    fs.writeFileSync(outPath, d.text, 'utf8');
    console.log('SUCCESS. Panjang teks:', d.text.length);
    console.log('File disimpan ke:', outPath);
    console.log('Output exists:', fs.existsSync(outPath));
    console.log('--- 3000 karakter pertama ---');
    console.log(d.text.slice(0, 3000));
  } catch (e) {
    console.error('ERROR:', e);
    console.error('ERROR stack:', e.stack);
    process.exit(1);
  }
}

main();
