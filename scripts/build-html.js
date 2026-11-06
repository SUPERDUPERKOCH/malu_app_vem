/*
 * Gera src/appHtml.ts a partir de web/App_Vida_em_Movimento.html.
 * Rode de novo sempre que trocar o HTML:  npm run build:html
 *
 * Ajustes feitos no HTML (o resto fica idêntico ao original):
 *  1. Safe area: env(safe-area-inset-*) vira var(--sa-*), preenchido pelo app nativo.
 *  2. localStorage vira VEMStorage (salvo em arquivo no celular, não se perde).
 *  3. "Salvar imagem" usa o compartilhar nativo do celular (galeria, Instagram, WhatsApp).
 *  4. Botão voltar do Android fecha modal/tela aberta antes de sair.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'web', 'App_Vida_em_Movimento.html'), 'utf8');

function troca(de, para, esperado) {
  const n = html.split(de).length - 1;
  if (esperado != null && n !== esperado) {
    throw new Error(`Esperava ${esperado} ocorrência(s) de "${de}", achei ${n}`);
  }
  html = html.split(de).join(para);
}

// 1. safe area
html = html.replace(/env\(safe-area-inset-(top|bottom|left|right)(?:\s*,\s*0px)?\)/g, 'var(--sa-$1,0px)');

// 2. armazenamento persistente
html = html.replace(/\blocalStorage\b/g, 'VEMStorage');

// 3. salvar imagem pelo app nativo (no modo demonstração)
troca(
  'S.equipe=true;semearDemo()}',
  'S.equipe=true;semearDemo();if(window.VEMNative)S.downloads=window.VEMNative.downloads}',
  1
);

// 4. botão voltar do Android
troca(
  'render();abertura();iniciar();',
  `window.__vemVoltar=function(){
    if(!$("#entrada").hidden)return false;
    if(!$("#quiz").hidden)return true;
    if(!$("#lembrete").hidden){$("#lembrete").hidden=true;return true}
    if($("#modal").innerHTML){if(!$("#modal [data-obrig]"))fecharModal();return true}
    if(S.folha){S.folha=null;render();return true}
    if(S.aba!=="inicio"){irPara("inicio");return true}
    return false};
render();abertura();iniciar();`,
  1
);

// 5. documento completo (o HTML exportado do artifact vem sem <html>/<head>)
if (!/<html[\s>]/i.test(html)) {
  const esqueleto = '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:var(--sa-top,0px);padding-bottom:var(--sa-bottom,0px)}html{scroll-padding-top:var(--sa-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>';
  html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + esqueleto + '</head><body>\n' + html + '\n</body></html>';
}

const bridge = fs.readFileSync(path.join(root, 'web', 'bridge.js'), 'utf8');
troca('<script>', `<script>${bridge}</script>\n<script>`, 1);

const out = `// Arquivo gerado por scripts/build-html.js — não edite à mão.\nexport default ${JSON.stringify(html)};\n`;
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'appHtml.ts'), out);
console.log('src/appHtml.ts gerado (' + Math.round(out.length / 1024) + ' KB)');
