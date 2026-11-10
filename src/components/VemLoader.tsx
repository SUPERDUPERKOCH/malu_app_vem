import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { serifFont } from '../theme';

interface VemLoaderProps { visible: boolean }

export function VemLoader({ visible }: VemLoaderProps) {
  const logo = useRef(new Animated.Value(0)).current;
  const name = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    logo.setValue(0); name.setValue(0); line.setValue(0); tagline.setValue(0);
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: 550, easing: Easing.out(Easing.back(1.15)), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(name, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(line, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(tagline, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [line, logo, name, tagline, visible]);

  return <Modal visible={visible} animationType="none" transparent={false} statusBarTranslucent navigationBarTranslucent>
    <StatusBar style="light" />
    <View style={styles.screen} accessibilityViewIsModal accessibilityLabel="VEM Vida em Movimento. Vamos juntas?">
      <View style={styles.orbitLarge} /><View style={styles.orbitSmall} />
      <View style={styles.brand}>
        <Animated.View style={[styles.logoBox, { opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [.76, 1] }) }, { translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}><Animated.Text style={styles.logo}>VEM</Animated.Text></Animated.View>
        <Animated.Text style={[styles.name, { opacity: name, transform: [{ translateY: name.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>Vida em Movimento</Animated.Text>
        <Animated.View style={[styles.goldLine, { transform: [{ scaleX: line }] }]} />
        <Animated.Text style={[styles.tagline, { opacity: tagline, transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>Vamos juntas?</Animated.Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#6B1F33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  brand: { alignItems: 'center', gap: 14, zIndex: 2 },
  logoBox: { borderWidth: 2, borderColor: '#FBEEE6', borderRadius: 14, paddingVertical: 10, paddingLeft: 22, paddingRight: 10 },
  logo: { color: '#FBEEE6', fontSize: 38, lineHeight: 46, fontWeight: '800', letterSpacing: 12 },
  name: { color: '#FBEEE6', fontFamily: serifFont, fontSize: 24, letterSpacing: .4 },
  goldLine: { width: 58, height: 2, backgroundColor: '#C49A45' },
  tagline: { color: '#D8B062', fontFamily: serifFont, fontSize: 18, fontStyle: 'italic' },
  orbitLarge: { position: 'absolute', width: 410, height: 410, borderRadius: 205, borderWidth: 1, borderColor: 'rgba(251,238,230,.10)', right: -190, top: -100 },
  orbitSmall: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: 'rgba(196,154,69,.16)', left: -125, bottom: -55 },
});
