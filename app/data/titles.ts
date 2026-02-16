export type Title = {
  id: string;
  title: string;
  poster: any;
  category: "trending" | "new";
  year: string;
  runtime: string;
  synopsis: string;
  video?: any;
};

export const titles: Title[] = [
  {
    id: "south-side-nights",
    title: "South Side Nights",
    poster: require("../../assets/images/south-side-nights.jpg"),
    category: "trending",
    year: "2026",
    runtime: "1h 42m",
    synopsis: "Late-night stories and city lights on the South Side.",
    video: require("../../assets/images/videos/sample.mp4"),
  },
  {
    id: "lakefront-legends",
    title: "Lakefront Legends",
    poster: require("../../assets/images/lakefront-legends.jpg"),
    category: "trending",
    year: "2026",
    runtime: "1h 28m",
    synopsis: "A documentary-style ride along Chicago’s lakefront.",
    video: require("../../assets/images/videos/sample.mp4"),
  },
  {
    id: "midnight-on-michigan",
    title: "Midnight on Michigan",
    poster: require("../../assets/images/midnight-on-michigan.jpg"),
    category: "new",
    year: "2026",
    runtime: "2h 01m",
    synopsis: "A thriller that moves with the city after dark.",
    video: require("../../assets/images/videos/sample.mp4"),
  },
];

export default titles;