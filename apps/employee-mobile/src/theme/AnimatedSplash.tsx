import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BrandRidge } from "./BrandRidge";
import { BrandSeal } from "./BrandSeal";
import { colors } from "./tokens";

type Props = {
  onFinished: () => void;
};

/** Splash Mshahara — fond clair (pas de lagon), logo animé ~5s. */
export function AnimatedSplash({ onFinished }: Props) {
  const sealScale = useSharedValue(0.4);
  const sealOpacity = useSharedValue(0);
  const wordOpacity = useSharedValue(0);
  const wordY = useSharedValue(18);
  const payOpacity = useSharedValue(0);
  const ridgeOpacity = useSharedValue(0);
  const ridgeScaleX = useSharedValue(0.2);
  const tagOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    sealOpacity.value = withTiming(1, { duration: 420 });
    sealScale.value = withSpring(1, { damping: 12, stiffness: 140 });

    wordOpacity.value = withDelay(280, withTiming(1, { duration: 450 }));
    wordY.value = withDelay(280, withSpring(0, { damping: 14, stiffness: 120 }));

    payOpacity.value = withDelay(520, withTiming(1, { duration: 380 }));

    ridgeOpacity.value = withDelay(700, withTiming(1, { duration: 300 }));
    ridgeScaleX.value = withDelay(
      700,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );

    tagOpacity.value = withDelay(1200, withTiming(1, { duration: 500 }));

    screenOpacity.value = withDelay(
      4500,
      withTiming(0, { duration: 500 }, (finished) => {
        if (finished) runOnJS(onFinished)();
      }),
    );
  }, [
    onFinished,
    payOpacity,
    ridgeOpacity,
    ridgeScaleX,
    screenOpacity,
    sealOpacity,
    sealScale,
    tagOpacity,
    wordOpacity,
    wordY,
  ]);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const sealStyle = useAnimatedStyle(() => ({
    opacity: sealOpacity.value,
    transform: [{ scale: sealScale.value }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordY.value }],
  }));

  const payStyle = useAnimatedStyle(() => ({
    opacity: payOpacity.value,
  }));

  const ridgeStyle = useAnimatedStyle(() => ({
    opacity: ridgeOpacity.value,
    transform: [{ scaleX: ridgeScaleX.value }],
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
  }));

  return (
    <Animated.View style={[styles.root, screenStyle]} pointerEvents="none">
      <Animated.View style={sealStyle}>
        <BrandSeal size={108} variant="onLight" />
      </Animated.View>

      <Animated.View style={[styles.wordRow, wordStyle]}>
        <Text style={styles.ankiba}>Msha</Text>
        <Animated.Text style={[styles.pay, payStyle]}>hara</Animated.Text>
      </Animated.View>

      <Animated.View style={[styles.ridgeWrap, ridgeStyle]}>
        <BrandRidge width={240} height={16} />
      </Animated.View>

      <Animated.Text style={[styles.tag, tagStyle]}>
        PAIE · RH · POINTAGE
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    gap: 14,
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 10,
  },
  ankiba: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 42,
    color: colors.lagoon,
    letterSpacing: -1,
  },
  pay: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 42,
    color: colors.gold,
    letterSpacing: -1,
  },
  ridgeWrap: {
    alignItems: "center",
  },
  tag: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 3,
    color: colors.lagoon,
    marginTop: 4,
  },
});
