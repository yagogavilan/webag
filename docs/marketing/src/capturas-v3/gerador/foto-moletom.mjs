// Foto do produto do cadastro rapido (ilustracao no estilo do kit v3). Gera /tmp/webag-mkt/v3/moletom.jpg
import { createRequire } from 'node:module';
const sharp = createRequire('/home/user/webag/apps/api/package.json')('sharp');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#FFC93C"/>
<ellipse cx="600" cy="1000" rx="340" ry="26" fill="rgba(28,23,33,0.18)"/>
<path d="M430 230 C470 170 730 170 770 230 L930 300 L1090 700 L960 760 L880 560 V960 H320 V560 L240 760 L110 700 L270 300 Z" fill="#B9B3C2"/>
<path d="M770 230 L930 300 L1090 700 L960 760 L880 560 V960 H760 V330 Z" fill="#8F8A99"/>
<path d="M430 230 C470 360 730 360 770 230 C740 180 460 180 430 230 Z" fill="#8F8A99"/>
<path d="M470 250 C500 330 700 330 730 250" fill="none" stroke="#1C1721" stroke-width="16" stroke-linecap="round"/>
<path d="M560 330 V470 M640 330 V470" stroke="#1C1721" stroke-width="14" stroke-linecap="round"/>
<path d="M420 700 H780 L820 880 H380 Z" fill="#8F8A99"/>
<rect x="330" y="900" width="540" height="60" rx="12" fill="#6F6A79"/>
<rect x="520" y="560" width="160" height="22" rx="11" fill="#C02EF0"/><rect x="480" y="600" width="240" height="22" rx="11" fill="#D6FF4A"/>
</svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile('/tmp/webag-mkt/v3/moletom.jpg');
