import { View } from "react-native";

type Props = { width?: number; height?: number };

export default function Spacer({ width = 1, height = 1 }: Props) {
  return <View style={{ width, height }} />;
}
