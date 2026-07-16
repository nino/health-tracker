import { useColorScheme } from "react-native";

import { type Staleness } from "../lib/staleness";

export interface Theme {
  background: string;
  card: string;
  text: string;
  secondaryText: string;
  border: string;
  tint: string;
}

const light: Theme = {
  background: "#f2f2f7",
  card: "#ffffff",
  text: "#000000",
  secondaryText: "#6e6e73",
  border: "#e5e5ea",
  tint: "#007aff",
};

const dark: Theme = {
  background: "#000000",
  card: "#1c1c1e",
  text: "#ffffff",
  secondaryText: "#98989e",
  border: "#38383a",
  tint: "#0a84ff",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

// iOS system palette values; equally legible on Android.
export function stalenessColor(bucket: Staleness, theme: Theme): string {
  switch (bucket) {
    case "fresh":
      return theme.secondaryText;
    case "green":
      return "#34c759";
    case "yellow":
      return "#ffcc00";
    case "orange":
      return "#ff9500";
    case "red":
      return "#ff3b30";
  }
}
