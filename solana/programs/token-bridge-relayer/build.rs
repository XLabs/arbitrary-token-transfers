use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;

#[cfg(all(feature = "mainnet", feature = "testnet"))]
compile_error!("Network features are mutually exclusive: 'mainnet', 'testnet'.");

#[cfg(not(any(feature = "mainnet", feature = "testnet")))]
const TEST_KEYPAIR_PATH: &str = "test-program-keypair.json";

// Example custom build script.
fn main() -> Result<()> {
    // Tell Cargo that if the JSON file changes, or the env variable, to rerun this build script:
    println!("cargo:rerun-if-changed=network.json");
    println!("cargo:rerun-if-changed=src/id.rs");

    // Generate the id.rs file:
    let network = Network::deserialize("network.json")?;
    let program_id = network.value()?;

    fs::write(
        "src/id.rs",
        format!("anchor_lang::prelude::declare_id!({:?});\n", program_id),
    )
    .context("could not write the file: id.rs")?;

    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Network {
    #[cfg(feature = "mainnet")]
    mainnet: String,
    #[cfg(feature = "testnet")]
    testnet: NetworkAddresses,
}

impl Network {
    fn deserialize(path: &str) -> Result<Self> {
        let file = fs::read_to_string(path).context(format!(
            "Failed to read the file with the network config: {path}"
        ))?;
        let content = serde_json::from_str(&file)
            .context(format!("Failed to deserialize the file: {path}"))?;

        Ok(content)
    }

    #[cfg(feature = "mainnet")]
    fn value(&self) -> Result<NetworkAddresses> {
        Ok(self.mainnet.clone())
    }

    #[cfg(feature = "testnet")]
    fn value(&self) -> Result<NetworkAddresses> {
        Ok(self.testnet.clone())
    }

    #[cfg(not(any(feature = "mainnet", feature = "testnet",)))]
    fn value(&self) -> Result<String> {
        let file = fs::read_to_string(TEST_KEYPAIR_PATH).context(format!(
            "Failed to read the file with the test program keypair: {TEST_KEYPAIR_PATH}"
        ))?;
        let content: Vec<u8> = serde_json::from_str(&file).context(format!(
            "Failed to deserialize the file: {TEST_KEYPAIR_PATH}"
        ))?;
        assert_eq!(content.len(), 64, "The keypair file should have 64 bytes");
        let keypair = ed25519_dalek::Keypair::from_bytes(&content)
            .context(format!("Invalid keypair in the file: {TEST_KEYPAIR_PATH}"))?;

        Ok(bs58::encode(keypair.public.as_bytes()).into_string())
    }
}
