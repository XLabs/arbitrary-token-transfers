use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use std::io;
use wormhole_io::{Readable, Writeable};

const PAYLOAD_ID_SIZE: usize = 1; // 1 byte

#[derive(Clone, Copy)]
pub enum RelayerMessage {
    V0 {
        recipient: [u8; 32],
        gas_dropoff_amount: u32,
    },
}

impl RelayerMessage {
    pub fn new(recipient: [u8; 32], gas_dropoff_amount: u32) -> Self {
        Self::V0 {
            gas_dropoff_amount,
            recipient,
        }
    }

    pub fn new_serialized(recipient: [u8; 32], gas_dropoff_amount: u32) -> io::Result<Vec<u8>> {
        let msg = Self::V0 {
            gas_dropoff_amount,
            recipient,
        };

        msg.try_to_vec()
    }
}

impl Readable for RelayerMessage {
    const SIZE: Option<usize> = Some(PAYLOAD_ID_SIZE + 32 + 8);

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        R: io::Read,
    {
        match Readable::read(reader)? {
            0_u8 => Ok(RelayerMessage::V0 {
                gas_dropoff_amount: Readable::read(reader)?,
                recipient: Readable::read(reader)?,
            }),
            _invalid_variant => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid payload ID",
            )),
        }
    }
}

impl Writeable for RelayerMessage {
    fn written_size(&self) -> usize {
        match self {
            RelayerMessage::V0 {
                gas_dropoff_amount,
                recipient,
            } => PAYLOAD_ID_SIZE + gas_dropoff_amount.written_size() + recipient.written_size(),
        }
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        match self {
            RelayerMessage::V0 {
                gas_dropoff_amount,
                recipient,
            } => {
                0_u8.write(writer)?;
                gas_dropoff_amount.write(writer)?;
                recipient.write(writer)
            }
        }
    }
}

impl AnchorSerialize for RelayerMessage {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        self.write(writer)
    }
}

impl AnchorDeserialize for RelayerMessage {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        Readable::read(reader)
    }
}
