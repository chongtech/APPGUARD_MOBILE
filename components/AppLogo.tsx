import React from "react";
import Svg, { Rect, Path, G, Text as SvgText } from "react-native-svg";

interface AppLogoProps {
  size?: number;
}

/**
 * Brand logo rendered via react-native-svg — mirrors assets/icon.svg.
 */
export function AppLogo({ size = 120 }: AppLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Rect width="512" height="512" fill="#0f172a" rx={64} />
      <G fill="#fff">
        {/* Shield */}
        <Path
          d="M256 80 L160 120 L160 240 Q160 320 256 400 Q352 320 352 240 L352 120 Z"
          stroke="#0ea5e9"
          strokeWidth={8}
          fill="none"
        />
        {/* Building */}
        <Rect x={220} y={180} width={72} height={120} fill="#0ea5e9" />
        {/* Windows row 1 */}
        <Rect x={230} y={190} width={15} height={15} fill="#fff" />
        <Rect x={267} y={190} width={15} height={15} fill="#fff" />
        {/* Windows row 2 */}
        <Rect x={230} y={220} width={15} height={15} fill="#fff" />
        <Rect x={267} y={220} width={15} height={15} fill="#fff" />
        {/* Windows row 3 */}
        <Rect x={230} y={250} width={15} height={15} fill="#fff" />
        <Rect x={267} y={250} width={15} height={15} fill="#fff" />
        {/* Door */}
        <Rect x={242} y={270} width={28} height={30} fill="#334155" />
      </G>
      <SvgText
        x={256}
        y={450}
        fontFamily="Arial, sans-serif"
        fontSize={48}
        fontWeight="bold"
        fill="#0ea5e9"
        textAnchor="middle"
      >
        GUARD
      </SvgText>
    </Svg>
  );
}
