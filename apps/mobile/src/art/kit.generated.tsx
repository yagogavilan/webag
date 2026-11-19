// GERADO por scripts/build-art.mjs a partir de docs/design/kit/*.svg. Nao edite a mao (edite o SVG e rode pnpm --filter @webag/mobile assets:art).
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';

export interface ArtProps {
  /** Largura em dp; a altura segue a proporção do desenho. */
  width?: number;
  style?: StyleProp<ViewStyle>;
  /** Sem rótulo a arte é decorativa (escondida do leitor de tela). */
  accessibilityLabel?: string;
}

function svgProps(w: number, h: number, _label: string, props: ArtProps) {
  const width = props.width ?? w;
  return {
    width,
    height: (width * h) / w,
    style: props.style,
    accessibilityLabel: props.accessibilityLabel,
    accessibilityElementsHidden: !props.accessibilityLabel,
    importantForAccessibility: (props.accessibilityLabel ? 'yes' : 'no-hide-descendants') as 'yes' | 'no-hide-descendants',
  };
}

/** barras-divisor.svg (342 x 8). */
export function BarrasDivisor(props: ArtProps) {
  return (
      <Svg {...svgProps(342, 8, "Divisor de seção Webag", props)} viewBox="0 0 342 8">
      <G transform="skewX(-8)">
      <Rect x="1" y="1" width="18" height="6" rx="3" fill="#1C1721" />
      <Rect x="25" y="1" width="40" height="6" rx="3" fill="#C02EF0" />
      <Rect x="71" y="1" width="10" height="6" rx="3" fill="#1C1721" />
      </G>
      <Rect x="92" y="3.5" width="250" height="1" fill="#E8E3EB" />
      </Svg>
  );
}

/** celebracao.svg (390 x 260). */
export function Celebracao(props: ArtProps) {
  return (
      <Svg {...svgProps(390, 260, "Pedido confirmado", props)} viewBox="0 0 390 260">
      <Rect width="390" height="260" fill="#C02EF0" />
      <G fill="#FFFFFF">
      <Rect x="44" y="96" width="128" height="17" rx="8.5" />
      <Rect x="-14" y="127" width="206" height="17" rx="8.5" />
      <Rect x="16" y="158" width="150" height="17" rx="8.5" />
      </G>
      <G transform="translate(150 30) scale(1.68)">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="18" strokeLinejoin="round" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#FFFFFF" strokeWidth="14" />
      <Circle cx="80" cy="52" r="4.5" fill="#C02EF0" />
      <Circle cx="132" cy="52" r="4.5" fill="#C02EF0" />
      </G>
      <Circle cx="349" cy="180" r="37" fill="#C02EF0" />
      <Circle cx="349" cy="180" r="31" fill="#D6FF4A" />
      <Path d="M336 181l9 9 17-18" fill="none" stroke="#1C1721" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="120" y="40" width="26" height="9" rx="4.5" fill="#D6FF4A" transform="rotate(-24 133 44)" />
      <Circle cx="362" cy="56" r="7" fill="#1C1721" />
      <Rect x="176" y="214" width="12" height="12" rx="3" fill="#FFFFFF" transform="rotate(20 182 220)" />
      <Circle cx="64" cy="48" r="5" fill="#E198EC" />
      <Polygon points="300,228 318,228 315,240 302,240" fill="#1C1721" transform="rotate(14 309 234)" />
      <Rect x="250" y="12" width="22" height="7" rx="3.5" fill="#FFFFFF" transform="rotate(30 261 15)" />
      </Svg>
  );
}

/** etapa-a-caminho.svg (200 x 200). */
export function EtapaACaminho(props: ArtProps) {
  return (
      <Svg {...svgProps(200, 200, "Pedido a caminho", props)} viewBox="0 0 200 200">
      <Rect width="200" height="200" fill="#1C1721" />
      <G fill="#D6FF4A">
      <Rect x="8" y="92" width="36" height="11" rx="5.5" />
      <Rect x="0" y="114" width="60" height="11" rx="5.5" />
      <Rect x="14" y="136" width="44" height="11" rx="5.5" />
      </G>
      <Circle cx="86" cy="160" r="20" fill="#FFFFFF" />
      <Circle cx="86" cy="160" r="8" fill="#1C1721" />
      <Circle cx="168" cy="160" r="20" fill="#FFFFFF" />
      <Circle cx="168" cy="160" r="8" fill="#1C1721" />
      <Path d="M68 138H134L150 102H168L182 140Q188 152 180 156H70Q62 150 68 138Z" fill="#C02EF0" />
      <Path d="M152 104 160 70H178" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
      <G transform="translate(16 46) scale(.78)">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="18" strokeLinejoin="round" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#FFFFFF" strokeWidth="14" />
      <Circle cx="80" cy="52" r="4.5" fill="#1C1721" />
      <Circle cx="132" cy="52" r="4.5" fill="#1C1721" />
      </G>
      </Svg>
  );
}

/** etapa-entregue.svg (200 x 200). */
export function EtapaEntregue(props: ArtProps) {
  return (
      <Svg {...svgProps(200, 200, "Pedido entregue", props)} viewBox="0 0 200 200">
      <Rect width="200" height="200" fill="#1C1721" />
      <Rect x="22" y="168" width="160" height="14" rx="7" fill="#443C4C" />
      <G transform="translate(-24 36) scale(1.32)">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#C02EF0" stroke="#C02EF0" strokeWidth="18" strokeLinejoin="round" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#C02EF0" strokeWidth="14" />
      <Circle cx="80" cy="52" r="4.5" fill="#1C1721" />
      <Circle cx="132" cy="52" r="4.5" fill="#1C1721" />
      </G>
      <Circle cx="160" cy="62" r="26" fill="#D6FF4A" />
      <Path d="M148 62l8 8 16-17" fill="none" stroke="#1C1721" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
  );
}

/** etapa-separando.svg (200 x 200). */
export function EtapaSeparando(props: ArtProps) {
  return (
      <Svg {...svgProps(200, 200, "A loja está separando o pedido", props)} viewBox="0 0 200 200">
      <Rect width="200" height="200" fill="#1C1721" />
      <G fill="#D6FF4A">
      <Rect x="8" y="92" width="36" height="11" rx="5.5" />
      <Rect x="0" y="114" width="60" height="11" rx="5.5" />
      <Rect x="14" y="136" width="44" height="11" rx="5.5" />
      </G>
      <G transform="translate(-14 40) scale(1.32)">
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#C02EF0" strokeWidth="14" />
      </G>
      <G transform="translate(76 24) rotate(-14) scale(.44)">
      <Path d="M58 34 82 24Q100 42 118 24L142 34 186 72 162 106 144 96V188Q100 196 56 188V96L38 106 14 72Z" fill="#F2EFE9" />
      <Path d="M82 24Q100 50 118 24L111 21Q100 36 89 21Z" fill="#D6CFDB" />
      </G>
      <G transform="translate(126 44) rotate(12)">
      <Rect width="40" height="34" rx="6" fill="#D6FF4A" />
      <Rect x="17" width="6" height="34" fill="#1C1721" />
      </G>
      <G transform="translate(-14 40) scale(1.32)">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#C02EF0" stroke="#C02EF0" strokeWidth="18" strokeLinejoin="round" />
      <Circle cx="80" cy="52" r="4.5" fill="#1C1721" />
      <Circle cx="132" cy="52" r="4.5" fill="#1C1721" />
      </G>
      </Svg>
  );
}

/** forma-palco.svg (300 x 303). */
export function FormaPalco(props: ArtProps) {
  return (
      <Svg {...svgProps(300, 303, "Forma palco: corpo e alça da sacola Webag", props)} viewBox="56 4 100 101">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#C02EF0" stroke="#C02EF0" strokeWidth="18" strokeLinejoin="round" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#C02EF0" strokeWidth="14" />
      <Circle cx="80" cy="52" r="4.5" fill="#FAF8FB" />
      <Circle cx="132" cy="52" r="4.5" fill="#FAF8FB" />
      </Svg>
  );
}

/** formas-organicas.svg (360 x 140). */
export function FormasOrganicas(props: ArtProps) {
  return (
      <Svg {...svgProps(360, 140, "Formas orgânicas Webag", props)} viewBox="0 0 360 140">
      <Path d="M10 120V86a54 62 0 0 1 108 0v34z" fill="#C02EF0" />
      <Path d="M150 34q0-20 20-20h68q22 0 18 20l-12 76q-3 20-23 20h-48q-20 0-22-20z" fill="#1C1721" />
      <G transform="translate(286 70) rotate(-24)">
      <Rect x="-56" y="-22" width="112" height="44" rx="22" fill="#D6FF4A" />
      </G>
      </Svg>
  );
}

/** padrao-sacolas.svg (120 x 120). */
export function PadraoSacolas(props: ArtProps) {
  return (
      <Svg {...svgProps(120, 120, "Padrão Webag (ladrilho 120 x 120)", props)} viewBox="0 0 120 120">
      <Rect width="120" height="120" fill="#C02EF0" />
      <G fill="none" stroke="#A21FBE" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <Polygon points="26,30 58,30 53,52 28,52" />
      <Path d="M32 30a10 11 0 0 1 20 0" />
      <Polygon points="86,90 118,90 113,112 88,112" transform="translate(-30 0)" />
      <Path d="M62 90a10 11 0 0 1 20 0" />
      </G>
      <G fill="#A21FBE">
      <Rect x="70" y="30" width="14" height="6" rx="3" />
      <Rect x="66" y="42" width="30" height="6" rx="3" />
      <Rect x="74" y="54" width="20" height="6" rx="3" />
      <Rect x="6" y="94" width="14" height="6" rx="3" />
      <Rect x="2" y="106" width="22" height="6" rx="3" />
      </G>
      </Svg>
  );
}

/** selo-oferta.svg (120 x 56). */
export function SeloOferta(props: ArtProps) {
  return (
      <Svg {...svgProps(120, 56, "Selos Webag: oferta (inclinado) e adesivo (sombra dura)", props)} viewBox="0 0 120 56">
      <G transform="translate(6 14) skewX(-8)">
      <Rect width="48" height="26" rx="7" fill="#D6FF4A" />
      </G>
      <G transform="translate(66 12) rotate(-6 24 14)">
      <Rect x="3" y="3" width="48" height="28" rx="8" fill="#1C1721" />
      <Rect width="48" height="28" rx="8" fill="#D6FF4A" />
      </G>
      </Svg>
  );
}

/** sem-conexao.svg (240 x 200). */
export function SemConexao(props: ArtProps) {
  return (
      <Svg {...svgProps(240, 200, "Sem conexão", props)} viewBox="0 0 240 200">
      <G fill="#B3ABB9">
      <Rect x="14" y="96" width="14" height="12" rx="6" />
      <Rect x="34" y="96" width="10" height="12" rx="6" />
      <Rect x="2" y="122" width="22" height="12" rx="6" />
      <Rect x="32" y="122" width="22" height="12" rx="6" />
      <Rect x="16" y="148" width="12" height="12" rx="6" />
      <Rect x="36" y="148" width="14" height="12" rx="6" />
      </G>
      <G transform="translate(-6 34) scale(1.4)">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#D6CFDB" stroke="#D6CFDB" strokeWidth="18" strokeLinejoin="round" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#D6CFDB" strokeWidth="14" />
      <Circle cx="80" cy="52" r="4.5" fill="#FFFFFF" />
      <Circle cx="132" cy="52" r="4.5" fill="#FFFFFF" />
      </G>
      <G transform="translate(176 46)">
      <Circle r="24" fill="#1C1721" />
      <Path d="M-9-9 9 9M9-9-9 9" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      </G>
      </Svg>
  );
}

/** vazio-busca.svg (240 x 200). */
export function VazioBusca(props: ArtProps) {
  return (
      <Svg {...svgProps(240, 200, "Nada encontrado", props)} viewBox="0 0 240 200">
      <Circle cx="108" cy="92" r="62" fill="#F3F0F5" />
      <Circle cx="108" cy="92" r="62" fill="none" stroke="#C02EF0" strokeWidth="18" />
      <G transform="translate(152 140) rotate(40)">
      <Rect x="0" y="-11" width="66" height="22" rx="11" fill="#1C1721" />
      </G>
      <G transform="skewX(-8)">
      <Rect x="96" y="68" width="34" height="12" rx="6" fill="#1C1721" />
      <Rect x="82" y="88" width="58" height="12" rx="6" fill="#C02EF0" />
      <Rect x="108" y="108" width="26" height="12" rx="6" fill="#D6FF4A" />
      </G>
      </Svg>
  );
}

/** vazio-sacola.svg (240 x 200). */
export function VazioSacola(props: ArtProps) {
  return (
      <Svg {...svgProps(240, 200, "Sacola vazia", props)} viewBox="0 0 240 200">
      <G fill="#E198EC">
      <Rect x="18" y="104" width="22" height="12" rx="6" />
      <Rect x="8" y="128" width="40" height="12" rx="6" />
      <Rect x="20" y="152" width="28" height="12" rx="6" />
      </G>
      <G transform="translate(-20 30) scale(1.45)">
      <Polygon points="67,43 145,43 133,95 72,95" fill="#C02EF0" stroke="#C02EF0" strokeWidth="18" strokeLinejoin="round" />
      <Path d="M80 42A26 30 0 0 1 132 42" fill="none" stroke="#C02EF0" strokeWidth="14" />
      <Polygon points="64,36 148,36 146,44 66,44" fill="#1C1721" />
      <Circle cx="80" cy="56" r="4.5" fill="#FFFFFF" />
      <Circle cx="132" cy="56" r="4.5" fill="#FFFFFF" />
      </G>
      <Path d="M190 34q16 4 22 22" fill="none" stroke="#1C1721" strokeWidth="3" strokeLinecap="round" />
      <G transform="translate(196 52) rotate(18)">
      <Rect x="3" y="3" width="34" height="22" rx="6" fill="#1C1721" />
      <Rect width="34" height="22" rx="6" fill="#D6FF4A" />
      <Circle cx="8" cy="11" r="3" fill="#1C1721" />
      </G>
      </Svg>
  );
}

export const KIT_SIZES = {"BarrasDivisor":[342,8],"Celebracao":[390,260],"EtapaACaminho":[200,200],"EtapaEntregue":[200,200],"EtapaSeparando":[200,200],"FormaPalco":[300,303],"FormasOrganicas":[360,140],"PadraoSacolas":[120,120],"SeloOferta":[120,56],"SemConexao":[240,200],"VazioBusca":[240,200],"VazioSacola":[240,200]} as const;
