//! Bounded binary framing shared by the desktop bridge and stdio companion.
use serde_json::Value;
use std::io::{self, Read, Write};

pub const MAX_METADATA: u32 = 4 * 1024 * 1024;
pub const MAX_BINARY: u32 = 256 * 1024 * 1024;

pub struct Packet {
    pub metadata: Value,
    pub bytes: Vec<u8>,
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "invalid bridge frame")
}

pub fn read_packet(reader: &mut impl Read) -> io::Result<Packet> {
    read_packet_limited(reader, MAX_BINARY)
}

pub fn read_packet_limited(reader: &mut impl Read, binary_limit: u32) -> io::Result<Packet> {
    let mut header = [0_u8; 8];
    reader.read_exact(&mut header)?;
    let metadata_len = u32::from_be_bytes(header[..4].try_into().map_err(|_| invalid())?);
    let binary_len = u32::from_be_bytes(header[4..].try_into().map_err(|_| invalid())?);
    if metadata_len > MAX_METADATA || binary_len > binary_limit {
        return Err(invalid());
    }
    let mut json = vec![0; metadata_len as usize];
    reader.read_exact(&mut json)?;
    let metadata = serde_json::from_slice(&json).map_err(|_| invalid())?;
    let mut bytes = vec![0; binary_len as usize];
    reader.read_exact(&mut bytes)?;
    Ok(Packet { metadata, bytes })
}

pub fn write_packet(writer: &mut impl Write, packet: &Packet) -> io::Result<()> {
    let json = serde_json::to_vec(&packet.metadata)?;
    let metadata_len = u32::try_from(json.len()).map_err(|_| invalid())?;
    let binary_len = u32::try_from(packet.bytes.len()).map_err(|_| invalid())?;
    if metadata_len > MAX_METADATA || binary_len > MAX_BINARY {
        return Err(invalid());
    }
    writer.write_all(&metadata_len.to_be_bytes())?;
    writer.write_all(&binary_len.to_be_bytes())?;
    writer.write_all(&json)?;
    writer.write_all(&packet.bytes)?;
    writer.flush()
}

pub mod catalog;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn binary_pixels_roundtrip_without_json_arrays_or_base64() {
        let message = Packet {
            metadata: serde_json::json!({"ok": true}),
            bytes: vec![0, 255, 128, 17],
        };
        let mut wire = Vec::new();
        write_packet(&mut wire, &message).expect("write");
        let result = read_packet(&mut Cursor::new(wire)).expect("read");
        assert_eq!(result.bytes, message.bytes);
        assert_eq!(result.metadata, message.metadata);
    }

    #[test]
    fn rejects_oversized_allocation_and_truncated_frames() {
        let mut malicious = Vec::from((MAX_METADATA + 1).to_be_bytes());
        malicious.extend_from_slice(&0_u32.to_be_bytes());
        assert!(read_packet(&mut Cursor::new(malicious)).is_err());
        assert!(read_packet(&mut Cursor::new(vec![0; 7])).is_err());
    }
}
