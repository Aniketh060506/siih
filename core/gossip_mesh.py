"""
iTantra Gossip Mesh Router - Team Monte Carlo (SIH PS 26173)
Application-layer store-and-forward mesh networking with LRU cache deduplication
and TTL hop management across Wi-Fi Direct and Bluetooth.
"""

import time
from collections import OrderedDict
from typing import List, Tuple, Optional, Set
from .protocol import ITantraPacket

class GossipMeshRouter:
    def __init__(self, node_id: str, max_cache_size: int = 1000, default_ttl: int = 4):
        self.node_id = node_id
        self.max_cache_size = max_cache_size
        self.default_ttl = default_ttl
        # LRU cache of seen UUIDs -> timestamp
        self.seen_uuids: OrderedDict[str, float] = OrderedDict()
        self.peer_nodes: Set[str] = set()

    def register_peer(self, peer_id: str):
        self.peer_nodes.add(peer_id)

    def unregister_peer(self, peer_id: str):
        self.peer_nodes.discard(peer_id)

    def is_duplicate(self, msg_uuid: str) -> bool:
        """Checks if packet UUID has already been processed or relayed."""
        if msg_uuid in self.seen_uuids:
            # Refresh position in LRU
            self.seen_uuids.move_to_end(msg_uuid)
            return True
        return False

    def mark_seen(self, msg_uuid: str):
        self.seen_uuids[msg_uuid] = time.time()
        if len(self.seen_uuids) > self.max_cache_size:
            # Pop oldest
            self.seen_uuids.popitem(last=False)

    def process_incoming_packet(
        self, raw_bytes: bytes, sender_node_id: str
    ) -> Tuple[Optional[ITantraPacket], bool, Optional[bytes]]:
        """
        Processes an incoming packet.
        Returns:
            (parsed_packet, is_for_local_consumption, bytes_to_forward_to_peers)
        """
        packet, err = ITantraPacket.deserialize(raw_bytes)
        if err or not packet:
            return None, False, None

        uuid_str = packet.uuid_str

        # 1. Deduplication check
        if self.is_duplicate(uuid_str):
            # Already seen this message from another mesh route; drop to prevent storm
            return packet, False, None

        # Mark as seen
        self.mark_seen(uuid_str)

        # 2. Local consumption is always true for gossip broadcast
        is_local = True

        # 3. Check TTL for forwarding
        forward_bytes = None
        if packet.ttl > 1:
            # Create forward packet with decremented TTL
            forward_packet = ITantraPacket(
                text=packet.text,
                lang_id=packet.lang_id,
                is_sos=packet.is_sos,
                is_phone_mode=packet.is_phone_mode,
                ttl=packet.ttl - 1,
                msg_uuid=packet.uuid_bytes,
                timestamp=packet.timestamp
            )
            forward_bytes = forward_packet.serialize()

        return packet, is_local, forward_bytes
