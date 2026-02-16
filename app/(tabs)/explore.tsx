import { StyleSheet, Text, View } from "react-native";

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CHILLYWOOD</Text>
      <Text style={styles.sub}>Explore (custom)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0F",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#DC143C",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 2,
  },
  sub: { color: "white", marginTop: 10, opacity: 0.8 },
});