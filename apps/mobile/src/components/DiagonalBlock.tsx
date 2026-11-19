import { type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { theme } from '../theme';

export interface DiagonalBlockProps {
  /** Cor sólida do bloco (roxo da marca, noite ou a cor da loja). */
  color?: string;
  /** Altura total do bloco, com o corte. */
  height: number;
  /** Queda do corte diagonal (padrão 64 em 390 de largura). A diagonal sobe para a direita. */
  cut?: number;
  /** Cor de baixo do corte (a "folha clara" que invade o bloco). Só para acessibilidade visual: o recorte é transparente. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Bloco de cor com corte diagonal na base (inclinação Webag). A folha clara da tela começa onde a diagonal termina:
 * o conteúdo seguinte pode subir sobre o corte com margem negativa. Texto pequeno branco não vai sobre o roxo da marca (4,29:1): use noite.
 */
export function DiagonalBlock({ color = theme.color.brand[500], height, cut = theme.shape.cutHeight, children, style, testID }: DiagonalBlockProps) {
  const { width } = useWindowDimensions();
  const drop = Math.round((cut * width) / 390);
  return (
    <View style={[{ height }, style]} testID={testID}>
      <Svg height={height} pointerEvents="none" style={StyleSheet.absoluteFill} width={width}>
        <Polygon fill={color} points={`0,0 ${width},0 ${width},${height - drop} 0,${height}`} />
      </Svg>
      {children}
    </View>
  );
}
