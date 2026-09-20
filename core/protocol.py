"""
iTantra Protocol Specification - Team Monte Carlo (SIH PS 26173)
Ultra-low bitrate neural transceiver binary and JSON framing.

Packet Structure:
- 1 Byte: Magic Byte 0x1F (iTantra Header)
- 16 Bytes: UUID (Unique message ID for gossip mesh deduplication)
- 1 Byte: TTL (Time-To-Live hop count, default 4)
- 1 Byte: Flags
    Bit 0 (0x01): SOS Emergency Alert (1 = Override volume to 100%, non-interruptible)
    Bit 1 (0x02): Transmission Mode (0 = PTT Walkie-Talkie, 1 = Phone Hands-free)
    Bit 2 (0x04): Ack Requested
    Bit 3 (0x08): Mesh Relay Flag
- 1 Byte: Language ID (0 to 9)
    0: Hindi (hi)
    1: Gujarati (gu)
    2: Marathi (mr)
    3: Kannada (kn)
    4: Malayalam (ml)
    5: Tamil (ta)
    6: Telugu (te)
    7: Odia (or)
    8: Bengali (bn)
    9: English (en)
- 2 Bytes: Payload Length (Big Endian unsigned short)
- N Bytes: UTF-8 encoded text payload
- 2 Bytes: CRC-16-CCITT Checksum (polynomial 0x1021)
"""

import struct
import uuid
import time
from typing import Dict, Any, Tuple, Optional

MAGIC_BYTE = 0x1F

FLAG_EMERGENCY_SOS = 0x01
FLAG_MODE_PHONE    = 0x02
FLAG_ACK_REQ       = 0x04
FLAG_RELAYED       = 0x08

LANGUAGES = {
    0: {"code": "hi", "name": "Hindi", "script": "Devanagari"},
    1: {"code": "gu", "name": "Gujarati", "script": "Gujarati"},
    2: {"code": "mr", "name": "Marathi", "script": "Devanagari"},
    3: {"code": "kn", "name": "Kannada", "script": "Kannada"},
    4: {"code": "ml", "name": "Malayalam", "script": "Malayalam"},
    5: {"code": "ta", "name": "Tamil", "script": "Tamil"},
    6: {"code": "te", "name": "Telugu", "script": "Telugu"},
    7: {"code": "or", "name": "Odia", "script": "Odia"},
    8: {"code": "bn", "name": "Bengali", "script": "Bengali"},
    9: {"code": "en", "name": "English", "script": "Latin"},
}

CODE_TO_ID = {v["code"]: k for k, v in LANGUAGES.items()}

def crc16_ccitt(data: bytes, poly: int = 0x1021, init: int = 0xFFFF) -> int:
    """Calculate CRC-16-CCITT for packet integrity verification."""
    crc = init
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ poly) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


class ITantraPacket:
    def __init__(
        self,
        text: str,
        lang_id: int = 0,
        is_sos: bool = False,
        is_phone_mode: bool = False,
        ttl: int = 4,
        msg_uuid: Optional[bytes] = None,
        timestamp: Optional[float] = None
    ):
        self.text = text
        self.lang_id = lang_id if lang_id in LANGUAGES else 0
        self.is_sos = is_sos
        self.is_phone_mode = is_phone_mode
        self.ttl = ttl
        self.uuid_bytes = msg_uuid if msg_uuid and len(msg_uuid) == 16 else uuid.uuid4().bytes
        self.timestamp = timestamp or time.time()

    @property
    def uuid_str(self) -> str:
        return str(uuid.UUID(bytes=self.uuid_bytes))

    @property
    def flags(self) -> int:
        f = 0
        if self.is_sos:
            f |= FLAG_EMERGENCY_SOS
        if self.is_phone_mode:
            f |= FLAG_MODE_PHONE
        return f

    def serialize(self) -> bytes:
        """Encodes packet into ultra-compact binary frame."""
        payload_bytes = self.text.encode('utf-8')
        payload_len = len(payload_bytes)

        # Header without CRC:
        # Magic (1B) + UUID (16B) + TTL (1B) + Flags (1B) + LangID (1B) + Len (2B) = 22 Bytes
        header_format = ">B16sBBBH"
        header = struct.pack(
            header_format,
            MAGIC_BYTE,
            self.uuid_bytes,
            self.ttl,
            self.flags,
            self.lang_id,
            payload_len
        )
        body = header + payload_bytes
        chk = crc16_ccitt(body)
        return body + struct.pack(">H", chk)

    @classmethod
    def deserialize(cls, raw: bytes) -> Tuple[Optional['ITantraPacket'], Optional[str]]:
        """Parses and verifies incoming raw binary bytes."""
        if len(raw) < 24: # Minimum frame size: 22 bytes header + 2 bytes CRC
            return None, "Packet too short"

        magic = raw[0]
        if magic != MAGIC_BYTE:
            return None, f"Invalid Magic Byte: 0x{magic:02X}"

        # Verify CRC
        expected_crc = crc16_ccitt(raw[:-2])
        received_crc = struct.unpack(">H", raw[-2:])[0]
        if expected_crc != received_crc:
            return None, f"CRC mismatch: expected 0x{expected_crc:04X}, received 0x{received_crc:04X}"

        header_format = ">B16sBBBH"
        magic, uuid_bytes, ttl, flags, lang_id, payload_len = struct.unpack_from(header_format, raw, 0)

        payload_offset = struct.calcsize(header_format)
        payload_bytes = raw[payload_offset:payload_offset + payload_len]

        try:
            text = payload_bytes.decode('utf-8')
        except UnicodeDecodeError:
            return None, "Failed to decode UTF-8 payload"

        is_sos = bool(flags & FLAG_EMERGENCY_SOS)
        is_phone_mode = bool(flags & FLAG_MODE_PHONE)

        packet = cls(
            text=text,
            lang_id=lang_id,
            is_sos=is_sos,
            is_phone_mode=is_phone_mode,
            ttl=ttl,
            msg_uuid=uuid_bytes
        )
        return packet, None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "uuid": self.uuid_str,
            "ttl": self.ttl,
            "is_sos": self.is_sos,
            "mode": "phone" if self.is_phone_mode else "ptt",
            "lang_id": self.lang_id,
            "lang_code": LANGUAGES.get(self.lang_id, {}).get("code", "unknown"),
            "lang_name": LANGUAGES.get(self.lang_id, {}).get("name", "unknown"),
            "text": self.text,
            "timestamp": self.timestamp,
            "packet_size_bytes": len(self.serialize())
        }
