import { router } from "expo-router";
import React from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

type TitleItem = {
  id: string;
  title: string;
  subtitle: string;
  poster: any;
};

const TITLES: TitleItem[] = [
  {
    id: "south-side-nights",
    title: "South Side Nights",
    subtitle: "Chicago skyline after dark",
    poster: require("../../assets/images/south-side-nights.jpg"),
  },
  {
    id: "midnight-on-michigan",
    title: "Midnight on Michigan",
    subtitle: "Late-night drive vibes",
    poster: require("../../assets/images/midnight-on-michigan.jpg"),
  },
  {
    id: "lakefront-legends",
    title: "Lakefront Legends",
    subtitle: "City stories by the water",
    poster: require("../../assets/images/lakefront-legends.jpg"),
  },
];

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>CHILLYWOOD</Text>
      <Text style={styles.sub}>Explore</Text>

      <FlatList
        data={TITLES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/player/${item.id}`)}
          >
            <Image source={item.poster} style={styles.poster} />
            <View style={styles.meta}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0F",
    paddingTop: 18,
    paddingHorizontal: 16,
  },
  brand: {
    color: "#DC143C",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  sub: {
    color: "#FFFFFF",
    opacity: 0.75,
    marginTop: 6,
    marginBottom: 14,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
  },
  poster: {
    width: "100%",
    height: 180,
  },
  meta: {
    padding: 12,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: "#FFFFFF",
    opacity: 0.7,
    marginTop: 4,
  },
});