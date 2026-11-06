import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'workout'
  | 'nutrition'
  | 'evolution'
  | 'book'
  | 'profile'
  | 'eye'
  | 'eyeOff'
  | 'clock'
  | 'bell'
  | 'calendar'
  | 'chevronRight'
  | 'play'
  | 'droplet'
  | 'heart'
  | 'logout'
  | 'lock'
  | 'gift'
  | 'check'
  | 'star';

interface VemIconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function VemIcon({ name, size = 24, color = 'currentColor', strokeWidth = 1.9 }: VemIconProps) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'home' && <Path {...common} d="M4 11 12 4.5 20 11v9h-5.5v-5.5h-5V20H4z" />}
      {name === 'workout' && <><Path {...common} d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" /></>}
      {name === 'nutrition' && <><Path {...common} d="M6 3v6a2 2 0 0 0 4 0V3M8 9v12M17 21V3c-2 1-3.5 3.5-3.5 7 0 1.7 1.3 3 3.5 3" /></>}
      {name === 'evolution' && <><Path {...common} d="m3 17 5-5 4 3 8-8M15 7h5v5" /></>}
      {name === 'book' && <><Path {...common} d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5zM12 6v13.5" /></>}
      {name === 'profile' && <><Circle {...common} cx="12" cy="8" r="4" /><Path {...common} d="M4 20c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5" /></>}
      {name === 'eye' && <><Path {...common} d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6" /><Circle {...common} cx="12" cy="12" r="2.5" /></>}
      {name === 'eyeOff' && <><Path {...common} d="M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a14 14 0 0 1-2.1 2.8M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 3.1-.5M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6" /></>}
      {name === 'clock' && <><Circle {...common} cx="12" cy="13" r="8" /><Path {...common} d="M12 9v4l2.5 2M9 2h6" /></>}
      {name === 'bell' && <><Path {...common} d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></>}
      {name === 'calendar' && <><Rect {...common} x="3.5" y="5" width="17" height="15" rx="3" /><Path {...common} d="M3.5 10h17M8 3v4M16 3v4" /></>}
      {name === 'chevronRight' && <Polyline {...common} points="9 5 16 12 9 19" />}
      {name === 'play' && <Path d="M8 5.5v13L18.5 12z" fill={color} />}
      {name === 'droplet' && <Path {...common} d="M12 3S6.5 9.2 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.2 12 3 12 3z" />}
      {name === 'heart' && <Path {...common} d="M20.8 5.7a5 5 0 0 0-7.1 0L12 7.4l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-8.2a5 5 0 0 0 0-7.1z" />}
      {name === 'logout' && <><Path {...common} d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>}
      {name === 'lock' && <><Rect {...common} x="4" y="10" width="16" height="10" rx="2" /><Path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
      {name === 'gift' && <><Rect {...common} x="3.5" y="9" width="17" height="11" rx="2" /><Path {...common} d="M2.5 9h19M12 9v11M12 9c-1.5-3.5-5.5-4.5-5.5-2S10 9 12 9zm0 0c1.5-3.5 5.5-4.5 5.5-2S14 9 12 9z" /></>}
      {name === 'check' && <Path {...common} strokeWidth={2.8} d="m5 12 5 5 9-10" />}
      {name === 'star' && <Path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" fill={color} />}
    </Svg>
  );
}
