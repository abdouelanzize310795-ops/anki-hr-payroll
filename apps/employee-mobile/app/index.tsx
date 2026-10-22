import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { colors } from "@/theme/tokens";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.sand,
        }}
      >
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  return <Redirect href="/(app)/home" />;
}
