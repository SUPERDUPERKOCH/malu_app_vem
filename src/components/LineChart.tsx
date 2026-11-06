import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '../theme';

interface LineChartProps {
  values: number[];
  /** Rótulos do primeiro e do último ponto. */
  labels?: [string, string];
  height?: number;
  accessibilityLabel: string;
}

/** Linha com área preenchida, como os gráficos do esboço VEM. O último ponto fica destacado. */
export function LineChart({ values, labels, height = 96, accessibilityLabel }: LineChartProps) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(Math.round(event.nativeEvent.layout.width));
  const padX = 6; const padTop = 10; const padBottom = labels ? 18 : 6;
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const x = (index: number): number => (values.length === 1 ? width / 2 : padX + (index * (width - padX * 2)) / (values.length - 1));
  const y = (value: number): number => padTop + (1 - (value - min) / range) * (height - padTop - padBottom);
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const base = height - padBottom;
  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {width > 0 && values.length > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={base} y2={base} stroke={theme.colors.border} strokeWidth={1} />
          <Polygon points={`${x(0)},${base} ${points} ${x(values.length - 1)},${base}`} fill={theme.colors.secondary} opacity={0.14} />
          <Polyline points={points} fill="none" stroke={theme.colors.secondary} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {values.map((value, index) => (
            <Circle key={index} cx={x(index)} cy={y(value)} r={index === values.length - 1 ? 3.8 : 2.6} fill={index === values.length - 1 ? theme.colors.primary : theme.colors.secondary} />
          ))}
          {labels && (
            <>
              <SvgText x={padX} y={height - 4} fill={theme.colors.textMuted} fontSize={10}>{labels[0]}</SvgText>
              <SvgText x={width - padX} y={height - 4} fill={theme.colors.textMuted} fontSize={10} textAnchor="end">{labels[1]}</SvgText>
            </>
          )}
        </Svg>
      )}
    </View>
  );
}
