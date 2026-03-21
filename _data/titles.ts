// _data/titles.ts

export type Title = {
  id: string;
  title: string;
  genre: string;
  year: string;
  runtime: string;
  description: string;
  poster: any;
  video: any;
};

export const titles: Title[] = [
  {
    id: "t1",
    title: "Chicago Streets",
    genre: "DRAMA",
    year: "2025",
    runtime: "95 min",
    description: "A story about life and survival in Chicago.",
    poster: require("../assets/images/chicago-skyline.jpg"),
    video: require("../assets/videos/sample.mp4"),
  },
];
