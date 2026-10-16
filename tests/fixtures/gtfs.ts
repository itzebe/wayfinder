import GtfsRealtime from "gtfs-realtime-bindings";

/**
 * Encodes a GTFS Realtime feed the way a real operator publishes it: protobuf.
 * Using the same encoder the adapters decode with keeps the fixture honest about
 * the wire format.
 */
export function sseFeed(json: unknown): Uint8Array {
  const message = GtfsRealtime.transit_realtime.FeedMessage.fromObject(json as { [k: string]: unknown });
  return GtfsRealtime.transit_realtime.FeedMessage.encode(message).finish();
}
