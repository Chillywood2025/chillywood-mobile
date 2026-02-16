import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { titles } from "../data/titles";

export default function ExploreScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Trending in Chicago</Text>

      <FlatList
        data={titles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/player/${item.id}`)}
          >
            <Image source={item.poster} style={styles.poster} />
            <Text style={styles.title}>{item.title}</Text>
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
    padding: 16,
  },
  header: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 16,
  },
  card: {
    marginBottom: 20,
  },
  poster: {
    width: "100%",
    height: 200,
    borderRadius: 14,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    marginTop: 8,
    fontWeight: "700",
  },
});