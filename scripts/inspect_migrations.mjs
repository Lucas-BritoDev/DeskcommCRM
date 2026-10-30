import fs from 'node:fs';
import path from 'node:path';

const basePath = 'C:/Users/Henrique/.gemini/antigravity/brain/d46cc375-cbd8-4413-8cee-f4436fed7042/.system_generated/steps';

function parseMcpResult(stepNum) {
  const content = fs.readFileSync(path.join(basePath, String(stepNum), 'output.txt'), 'utf8');
  let text = content;
  try {
    const outer = JSON.parse(content);
    if (outer.result) text = outer.result;
  } catch (e) {}
  const jsonMatch = text.match(/<untrusted-data-([a-zA-Z0-9_-]+)>\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*<\/untrusted-data-\1>/);
  return JSON.parse(jsonMatch[2]);
}

const m1 = parseMcpResult(841);
const m2 = parseMcpResult(843);
const all = [...m1, ...m2];
all.sort((a,b) => a.version.localeCompare(b.version));

const cols = parseMcpResult(905);
console.log('Columns of itens_orcamento:');
console.log(cols.filter(c => c.table_name === 'itens_orcamento').map(c => `${c.column_name} (${c.data_type})`));


