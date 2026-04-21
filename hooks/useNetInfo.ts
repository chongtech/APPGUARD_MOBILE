import { useEffect, useState } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

export function useNetInfo() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsOnline(
        state.isConnected === true && state.isInternetReachable !== false,
      );
    });

    NetInfo.fetch().then((state: NetInfoState) => {
      setIsOnline(
        state.isConnected === true && state.isInternetReachable !== false,
      );
    });

    return unsubscribe;
  }, []);

  return { isOnline };
}
