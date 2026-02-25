use std::io::{self, Read, Write};

pub fn read_message() -> io::Result<Option<Vec<u8>>> {
    let mut stdin = io::stdin();
    let mut length_bytes = [0u8; 4];

    match stdin.read_exact(&mut length_bytes) {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }

    let length = u32::from_le_bytes(length_bytes) as usize;
    let mut buffer = vec![0u8; length];
    stdin.read_exact(&mut buffer)?;
    Ok(Some(buffer))
}

pub fn write_message(json_bytes: &[u8]) -> io::Result<()> {
    let mut stdout = io::stdout();
    let length = (json_bytes.len() as u32).to_le_bytes();

    stdout.write_all(&length)?;
    stdout.write_all(json_bytes)?;
    stdout.flush()?;
    Ok(())
}