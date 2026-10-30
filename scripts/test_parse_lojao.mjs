import fs from 'node:fs';
import path from 'node:path';

const basePath = 'C:/Users/Henrique/.gemini/antigravity/brain/d46cc375-cbd8-4413-8cee-f4436fed7042/.system_generated/steps';

function parseMcpResult(stepNum) {
  const content = fs.readFileSync(path.join(basePath, String(stepNum), 'output.txt'), 'utf8');
  let text = content;
  try {
    const outer = JSON.parse(content);
    if (outer.result) text = outer.result;
  } catch (e) {
    // raw text
  }
  const jsonMatch = text.match(/<untrusted-data-([a-zA-Z0-9_-]+)>\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*<\/untrusted-data-\1>/);
  if (!jsonMatch) {
    throw new Error(`Could not find untrusted data boundary in step ${stepNum}`);
  }
  return JSON.parse(jsonMatch[2]);
}

try {
  const s831 = parseMcpResult(831)[0];
  console.log('831 ok:', Object.keys(s831));

  const s833 = parseMcpResult(833)[0];
  console.log('833 ok: produtos =', s833.produtos.length, 'clientes =', s833.clientes.length);

  const s835 = parseMcpResult(835)[0];
  console.log('835 ok: orcamentos =', s835.orcamentos.length, 'itens =', s835.itens_orcamento.length);

  const s837 = parseMcpResult(837)[0];
  console.log('837 ok: precos =', s837.precos_venda.length);

  const s839 = parseMcpResult(839)[0];
  console.log('839 ok: variacoes =', s839.produto_variacoes.length);

  const s845 = parseMcpResult(845);
  console.log('845 ok: functions =', s845.map(f => f.proname));
  const s841 = parseMcpResult(841);
  console.log('841 ok: migrations 1-17 =', s841.length);

  const s843 = parseMcpResult(843);
  console.log('843 ok: migrations 18-34 =', s843.length);

  const s799 = parseMcpResult(799);
  console.log('799 ok: parametros =', s799.length);
  const s895 = parseMcpResult(895)[0].json_build_object;
  console.log('895 ok:', Object.keys(s895).map(k => `${k}: ${s895[k]?.length || 0}`));
} catch (err) {
  console.error('Error:', err);
}
