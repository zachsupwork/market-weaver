import { useEffect } from "react";
import { sportsWsService } from "@/services/sports-ws.service";
import { rtdsWsService } from "@/services/rtds-ws.service";

/**
 * Connect to Sports and RTDS WebSocket feeds.
 * Call this hook in any page that wants live sports scores and crypto prices.
 * Uses ref-counting so multiple mounts won't create duplicate connections.
 */
export function useLiveDataFeeds() {
  useEffect(() => {
    sportsWsService.connect();
    rtdsWsService.connect();

    return () => {
      sportsWsService.disconnect();
      rtdsWsService.disconnect();
    };
  }, []);
}
